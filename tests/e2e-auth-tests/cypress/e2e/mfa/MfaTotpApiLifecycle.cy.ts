// Request-level coverage of the /api/user/mfa/* management endpoints. The
// existing MFA specs drive the /mfa page UI (or seed a factor through the
// test-only endpoint), so the JSON contracts of these routes were never
// asserted directly:
//   GET    /api/user/mfa/status, /api/user/mfa/status/[factor_type]
//   POST   /api/user/mfa/totp/enroll, /api/user/mfa/totp/verify-enrollment
//   DELETE /api/user/mfa/totp/[factor_id]
//   POST   /api/user/mfa/recovery-codes/regenerate
//   GET    /api/user/mfa/webauthn, POST .../webauthn/authenticate-options,
//   DELETE /api/user/mfa/webauthn/[factor_id] (no-passkey branches only;
//          creating a passkey needs a Chromium virtual authenticator, see
//          WebauthnMfa.cy.ts)
// TOTP codes are computed on the Node side via cy.compute_totp_code().

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface MfaStatusResponseBody {
  enabled: boolean;
  factors: Array<{ factor_id: string; factor_type: string; verified_at: number }>;
  recovery_codes_remaining: number;
}

interface MfaFactorStatusResponseBody {
  enabled: boolean;
  pending: boolean;
  factor_id?: string;
  verified_at?: number;
}

interface MfaEnrollResponseBody {
  factor_id: string;
  factor_type: string;
  otpauth_url: string;
  qr_code_data_url: string;
  secret: string;
}

interface MfaVerifyEnrollmentResponseBody {
  success: boolean;
  message?: string;
  recovery_codes?: string[];
  recovery_codes_issued?: boolean;
}

interface LoginResponseBody {
  kind?: string;
  success?: boolean;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const UNKNOWN_FACTOR_ID = "00000000-0000-0000-0000-000000000099";

function loginAsFreshRegularUser(): Cypress.Chainable<{
  email: string;
  password: string;
}> {
  return cy.generate_random_test_user_credentials().then((credentials) =>
    cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((ok: boolean) => {
        expect(ok, "regular user registration + login").to.be.true;
        cy.reset_rate_limit();
        return credentials;
      }),
  );
}

/** Raw POST /api/auth/login so the `kind` discriminator can be inspected. */
function attemptLogin(
  email: string,
  password: string,
): Cypress.Chainable<Cypress.Response<LoginResponseBody>> {
  cy.reset_rate_limit();
  const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
  return cy
    .wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
      PKCE_ProofKeyManager.createCodeChallenge(verifier),
      { log: false },
    )
    .then((challenge) =>
      cy.request<LoginResponseBody>({
        method: "POST",
        url: "/api/auth/login",
        failOnStatusCode: false,
        body: {
          credentials: { email, password },
          client_app_id: AUTH_APP_ID,
          code_challenge: challenge.code_challenge,
          challenge_time: challenge.challenge_time,
          nonce: `e2e-nonce-${Date.now()}`,
          scope: DEFAULT_AUTH_SCOPE,
        },
      }),
    );
}

/** Enrolls TOTP purely via request; yields the factor id, secret and codes. */
function enrollTotpViaApi(): Cypress.Chainable<{
  factor_id: string;
  secret: string;
  recovery_codes: string[];
}> {
  return cy
    .request<MfaEnrollResponseBody>({
      method: "POST",
      url: "/api/user/mfa/totp/enroll",
    })
    .then((enroll) => {
      expect(enroll.status).to.eq(200);
      const { factor_id, secret } = enroll.body;
      return cy.compute_totp_code(secret).then((code) =>
        cy
          .request<MfaVerifyEnrollmentResponseBody>({
            method: "POST",
            url: "/api/user/mfa/totp/verify-enrollment",
            body: { factor_id, code },
          })
          .then((verify) => {
            expect(verify.status).to.eq(200);
            return {
              factor_id,
              secret,
              recovery_codes: verify.body.recovery_codes ?? [],
            };
          }),
      );
    });
}

describe("MFA TOTP API lifecycle", () => {
  it("reports no factors for a fresh user and rejects unknown factor types", () => {
    loginAsFreshRegularUser();
    cy.request<MfaStatusResponseBody>({
      method: "GET",
      url: "/api/user/mfa/status",
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.deep.equal({
        enabled: false,
        factors: [],
        recovery_codes_remaining: 0,
      });
    });
    cy.request<MfaFactorStatusResponseBody>({
      method: "GET",
      url: "/api/user/mfa/status/totp",
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.deep.equal({ enabled: false, pending: false });
    });
    cy.request({
      method: "GET",
      url: "/api/user/mfa/status/bogus",
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("enrolls TOTP via the API: pending -> verified, recovery codes issued, re-enrollment refused", () => {
    loginAsFreshRegularUser();

    cy.request({
      method: "POST",
      url: "/api/user/mfa/totp/verify-enrollment",
      body: { factor_id: UNKNOWN_FACTOR_ID, code: "123456" },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "verify unknown factor").to.eq(404);
    });
    cy.request({
      method: "POST",
      url: "/api/user/mfa/totp/verify-enrollment",
      body: { factor_id: "not-a-uuid" },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "verify malformed body").to.eq(400);
    });
    cy.request({
      method: "POST",
      url: "/api/user/mfa/totp/verify-enrollment",
      headers: { "content-type": "application/json" },
      body: "{not json",
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "verify non-JSON body").to.eq(400);
    });

    cy.request<MfaEnrollResponseBody>({
      method: "POST",
      url: "/api/user/mfa/totp/enroll",
    }).then((enroll) => {
      expect(enroll.status).to.eq(200);
      expect(enroll.body.factor_type).to.eq("totp");
      expect(enroll.body.factor_id).to.be.a("string");
      expect(enroll.body.secret).to.be.a("string").and.not.be.empty;
      expect(enroll.body.otpauth_url).to.match(/^otpauth:\/\/totp\//);
      expect(enroll.body.otpauth_url).to.include(
        `secret=${enroll.body.secret}`,
      );
      expect(enroll.body.qr_code_data_url).to.match(/^data:image\/png;base64,/);
      const { factor_id, secret } = enroll.body;

      cy.request<MfaFactorStatusResponseBody>({
        method: "GET",
        url: "/api/user/mfa/status/totp",
      }).then((response) => {
        expect(response.body.enabled, "pending factor is not enabled").to.eq(false);
        expect(response.body.pending).to.eq(true);
        expect(response.body.factor_id).to.eq(factor_id);
      });

      cy.request<MfaVerifyEnrollmentResponseBody>({
        method: "POST",
        url: "/api/user/mfa/totp/verify-enrollment",
        body: { factor_id, code: "000000" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "wrong code").to.eq(401);
        expect(response.body.success).to.eq(false);
      });

      cy.compute_totp_code(secret).then((code) => {
        cy.request<MfaVerifyEnrollmentResponseBody>({
          method: "POST",
          url: "/api/user/mfa/totp/verify-enrollment",
          body: { factor_id, code },
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.recovery_codes_issued).to.eq(true);
          expect(response.body.recovery_codes).to.have.length(10);
        });
      });

      cy.compute_totp_code(secret).then((code) => {
        cy.request({
          method: "POST",
          url: "/api/user/mfa/totp/verify-enrollment",
          body: { factor_id, code },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "verify an already verified factor").to.eq(409);
        });
      });
      cy.request({
        method: "POST",
        url: "/api/user/mfa/totp/enroll",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "enroll while a factor exists").to.eq(409);
      });

      cy.request<MfaStatusResponseBody>({
        method: "GET",
        url: "/api/user/mfa/status",
      }).then((response) => {
        expect(response.body.enabled).to.eq(true);
        expect(response.body.recovery_codes_remaining).to.eq(10);
        expect(response.body.factors).to.have.length(1);
        expect(response.body.factors[0]?.factor_id).to.eq(factor_id);
        expect(response.body.factors[0]?.factor_type).to.eq("totp");
        expect(response.body.factors[0]?.verified_at).to.be.a("number");
      });
      cy.request<MfaFactorStatusResponseBody>({
        method: "GET",
        url: "/api/user/mfa/status/totp",
      }).then((response) => {
        expect(response.body.enabled).to.eq(true);
        expect(response.body.pending).to.eq(false);
        expect(response.body.factor_id).to.eq(factor_id);
      });
    });
  });

  it("regenerates recovery codes with a valid TOTP proof and invalidates the old set", () => {
    loginAsFreshRegularUser().then((credentials) => {
      enrollTotpViaApi().then(({ factor_id, secret, recovery_codes }) => {
        cy.compute_totp_code(secret).then((code) => {
          cy.request({
            method: "POST",
            url: "/api/user/mfa/recovery-codes/regenerate",
            body: { factor_id: UNKNOWN_FACTOR_ID, code },
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "unknown factor").to.eq(400);
          });
        });
        cy.request({
          method: "POST",
          url: "/api/user/mfa/recovery-codes/regenerate",
          body: { factor_id, code: "000000" },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "wrong code").to.eq(401);
        });

        cy.compute_totp_code(secret).then((code) => {
          cy.request<MfaVerifyEnrollmentResponseBody>({
            method: "POST",
            url: "/api/user/mfa/recovery-codes/regenerate",
            body: { factor_id, code },
          }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.success).to.eq(true);
            expect(response.body.recovery_codes_issued).to.eq(true);
            const fresh = response.body.recovery_codes ?? [];
            expect(fresh).to.have.length(10);
            expect(fresh).to.not.include(recovery_codes[0]);

            // The old set no longer works at the login challenge.
            cy.logout();
            attemptLogin(credentials.email, credentials.password).then(
              (login) => {
                expect(login.body.kind).to.eq("mfa_required");
                const challenge_id = (login.body as { challenge_id?: string })
                  .challenge_id;
                cy.request({
                  method: "POST",
                  url: "/api/auth/mfa/verify",
                  body: {
                    challenge_id,
                    client_app_id: AUTH_APP_ID,
                    proof: {
                      type: "recovery_code",
                      recovery_code: recovery_codes[0],
                    },
                  },
                  failOnStatusCode: false,
                }).then((verify) => {
                  expect(verify.status, "old recovery code").to.eq(401);
                });
                cy.request({
                  method: "POST",
                  url: "/api/auth/mfa/verify",
                  body: {
                    challenge_id,
                    client_app_id: AUTH_APP_ID,
                    proof: { type: "recovery_code", recovery_code: fresh[0] },
                  },
                }).then((verify) => {
                  expect(verify.status, "regenerated recovery code").to.eq(200);
                  expect(verify.body.kind).to.eq("authenticated");
                });
              },
            );
          });
        });
      });
    });
  });

  it("removes the TOTP factor with a valid code, wiping recovery codes and disabling MFA at login", () => {
    loginAsFreshRegularUser().then((credentials) => {
      enrollTotpViaApi().then(({ factor_id, secret }) => {
        cy.compute_totp_code(secret).then((code) => {
          cy.request({
            method: "DELETE",
            url: "/api/user/mfa/totp/not-a-uuid",
            body: { code },
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "malformed factor id").to.eq(400);
          });
          cy.request({
            method: "DELETE",
            url: `/api/user/mfa/totp/${UNKNOWN_FACTOR_ID}`,
            body: { code },
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "unknown factor").to.eq(404);
          });
          cy.request({
            method: "DELETE",
            url: `/api/user/mfa/totp/${factor_id}`,
            body: { code, unexpected: true },
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "strict body").to.eq(400);
          });
        });
        cy.request({
          method: "DELETE",
          url: `/api/user/mfa/totp/${factor_id}`,
          body: { code: "000000" },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "wrong code").to.eq(401);
        });

        cy.compute_totp_code(secret).then((code) => {
          cy.request({
            method: "DELETE",
            url: `/api/user/mfa/totp/${factor_id}`,
            body: { code },
          }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.deep.equal({ success: true });
          });
        });

        cy.request<MfaStatusResponseBody>({
          method: "GET",
          url: "/api/user/mfa/status",
        }).then((response) => {
          expect(response.body).to.deep.equal({
            enabled: false,
            factors: [],
            recovery_codes_remaining: 0,
          });
        });

        cy.logout();
        attemptLogin(credentials.email, credentials.password).then((login) => {
          expect(login.status).to.eq(200);
          expect(login.body.kind, "login after factor removal").to.eq(
            "authenticated",
          );
        });
      });
    });
  });

  it("passkey endpoints without any enrolled passkey: empty list, 409 step-up options, 400/404 removal", () => {
    loginAsFreshRegularUser();
    enrollTotpViaApi().then(({ factor_id, secret }) => {
      cy.request({ method: "GET", url: "/api/user/mfa/webauthn" }).then(
        (response) => {
          expect(response.status).to.eq(200);
          expect(response.body).to.deep.equal({ credentials: [] });
        },
      );
      cy.request({
        method: "POST",
        url: "/api/user/mfa/webauthn/authenticate-options",
        body: {},
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(409);
        expect(response.body).to.have.property("success", false);
      });
      cy.compute_totp_code(secret).then((code) => {
        const proof = { type: "totp", factor_id, code };
        cy.request({
          method: "DELETE",
          url: "/api/user/mfa/webauthn/not-a-uuid",
          body: { proof },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "malformed passkey id").to.eq(400);
        });
        cy.request({
          method: "DELETE",
          url: `/api/user/mfa/webauthn/${UNKNOWN_FACTOR_ID}`,
          body: { proof },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "unknown passkey").to.eq(404);
        });
        // A TOTP factor id is not a passkey.
        cy.request({
          method: "DELETE",
          url: `/api/user/mfa/webauthn/${factor_id}`,
          body: { proof },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "TOTP factor via passkey route").to.eq(404);
        });
      });
    });
  });
});
