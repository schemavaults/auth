// Request-body validation contracts of the public auth endpoints. The UI
// specs only ever send well-formed bodies (client-side validation stops the
// rest), so none of these branches had coverage:
//   POST /api/auth/login                  -> non-JSON, zod (password policy,
//                                            email, PKCE fields, strict keys),
//                                            redirect_uri required / not
//                                            registered, "already signed in
//                                            as a different user" (403)
//   POST /api/auth/register               -> password policy, invite-code
//                                            length/format/unknown, invite
//                                            code required, "already signed
//                                            in" (403)
//   POST /api/auth/reset-password/request -> non-JSON / non-string email
//   POST /api/auth/reset-password/confirm -> non-GUID token, weak password
//                                            (zod issues in `errors`)
//   POST /api/auth/verify-email/request   -> non-JSON / invalid body
//   POST /api/auth/verify-email/confirm   -> non-GUID token
//   POST /api/auth/session/generate-authorization-code
//                                         -> invalid body, invalid_redirect_uri
//                                            (both variants), success
//   GET/PUT /api/user/profile             -> non-JSON, invalid fields with
//                                            `issues`, strict keys, clearing

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface AuthResponseBody {
  kind?: string;
  success?: boolean;
  message?: string;
  authorization_code?: string;
  error_id?: string;
  errors?: unknown[];
  issues?: unknown[];
  profile?: Record<string, unknown>;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const REGISTERED_ORIGIN = "https://validation-client.example";
const REGISTERED_REDIRECT_URI = `${REGISTERED_ORIGIN}/oauth/callback`;
const UNREGISTERED_REDIRECT_URI = "https://evil.example/callback";

function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createPkceChallenge(): Cypress.Chainable<CodeChallengeWithDetails> {
  const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
  return cy.wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
    PKCE_ProofKeyManager.createCodeChallenge(verifier),
    { log: false },
  );
}

/** A complete, valid login/register body for `client_app_id` (default: auth server). */
function authBody(
  email: string,
  password: string,
  extra: Record<string, unknown> = {},
): Cypress.Chainable<Record<string, unknown>> {
  return createPkceChallenge().then((challenge): Record<string, unknown> => ({
    credentials: { email, password },
    client_app_id: AUTH_APP_ID,
    code_challenge: challenge.code_challenge,
    challenge_time: challenge.challenge_time,
    nonce: `e2e-nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    scope: DEFAULT_AUTH_SCOPE,
    ...extra,
  }));
}

function post(
  url: string,
  body: Cypress.RequestBody,
  headers: Record<string, string> = {},
): Cypress.Chainable<Cypress.Response<AuthResponseBody>> {
  cy.reset_rate_limit();
  return cy.request<AuthResponseBody>({
    method: "POST",
    url,
    body,
    headers,
    failOnStatusCode: false,
  });
}

function expect400(
  response: Cypress.Response<AuthResponseBody>,
  label: string,
): void {
  expect(response.status, label).to.eq(400);
}

/** Superuser registers a public web app with one domain; leaves the session logged out. */
function createRegisteredClientApp(): Cypress.Chainable<string> {
  const app_id = `e2e-val-${Math.random().toString(36).slice(2, 12)}`;
  return cy
    .create_and_login_as_superuser_via_request()
    .then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
      cy.request({
        method: "POST",
        url: "/api/apps",
        body: {
          app_id,
          app_name: `Validation client ${app_id}`,
          app_description: "AuthApiRequestValidation.cy.ts",
          created_at: Date.now(),
          public: true,
          hardcoded: false,
          web: true,
        },
      }).then((response) => expect(response.status).to.eq(200));
      cy.request({
        method: "POST",
        url: `/api/apps/${app_id}/domains`,
        body: {
          app_domain_ref_id: generateV4Uuid(),
          app_id,
          domain: REGISTERED_ORIGIN,
          environment: Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test",
          created_at: Date.now(),
          hardcoded: false,
        },
      }).then((response) => expect(response.status).to.eq(200));
      cy.logout();
      return app_id;
    });
}

describe("Auth API request validation", () => {
  describe("POST /api/auth/login", () => {
    it("rejects malformed bodies with 400 before touching credentials", () => {
      cy.generate_random_test_user_credentials().then(({ email, password }) => {
        post("/api/auth/login", "{not json", {
          "content-type": "application/json",
        }).then((response) => {
          expect400(response, "non-JSON body");
          expect(response.body.kind).to.eq("failure");
        });
        authBody(email, "weak").then((body) =>
          post("/api/auth/login", body).then((r) => expect400(r, "weak password")),
        );
        authBody("not-an-email", password).then((body) =>
          post("/api/auth/login", body).then((r) => expect400(r, "invalid email")),
        );
        authBody(email, password, { unexpected: true }).then((body) =>
          post("/api/auth/login", body).then((r) => expect400(r, "unknown key")),
        );
        post("/api/auth/login", {
          credentials: { email, password },
          client_app_id: AUTH_APP_ID,
        }).then((r) => expect400(r, "missing PKCE fields"));
      });
    });

    it("enforces redirect_uri registration for third-party client apps", () => {
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request(credentials).then(
          (ok: boolean) => {
            expect(ok).to.be.true;
            cy.logout();
          },
        );
        createRegisteredClientApp().then((app_id) => {
          authBody(credentials.email, credentials.password, {
            client_app_id: app_id,
          }).then((body) =>
            post("/api/auth/login", body).then((response) => {
              expect400(response, "redirect_uri required");
              expect(response.body.kind).to.eq("failure");
              expect(String(response.body.message)).to.include("required");
            }),
          );
          authBody(credentials.email, credentials.password, {
            client_app_id: app_id,
            redirect_uri: UNREGISTERED_REDIRECT_URI,
          }).then((body) =>
            post("/api/auth/login", body).then((response) => {
              expect400(response, "redirect_uri not registered");
              expect(String(response.body.message)).to.include("not registered");
            }),
          );
          authBody(credentials.email, credentials.password, {
            client_app_id: app_id,
            redirect_uri: REGISTERED_REDIRECT_URI,
          }).then((body) =>
            post("/api/auth/login", body).then((response) => {
              expect(response.status, "registered redirect_uri").to.eq(200);
              expect(response.body.kind).to.eq("authenticated");
              expect(response.body.authorization_code).to.be.a("string");
            }),
          );
        });
      });
    });

    it("refuses to log in as a different user while another session cookie is present", () => {
      cy.generate_random_test_user_credentials().then((first) => {
        cy.generate_random_test_user_credentials().then((second) => {
          cy.create_and_login_as_regular_user_via_request(first).then(
            (ok: boolean) => {
              expect(ok).to.be.true;
              cy.logout();
            },
          );
          cy.create_and_login_as_regular_user_via_request(second).then(
            (ok: boolean) => expect(ok).to.be.true,
          );
          // Session cookie belongs to `second`; logging in as `first` is refused.
          authBody(first.email, first.password).then((body) =>
            post("/api/auth/login", body).then((response) => {
              expect(response.status).to.eq(403);
              expect(response.body.kind).to.eq("failure");
            }),
          );
          // Re-authenticating as the same user is fine.
          authBody(second.email, second.password).then((body) =>
            post("/api/auth/login", body).then((response) => {
              expect(response.status).to.eq(200);
              expect(response.body.kind).to.eq("authenticated");
            }),
          );
        });
      });
    });
  });

  describe("POST /api/auth/register", () => {
    it("rejects weak passwords and malformed, unknown or missing invite codes", () => {
      cy.generate_random_test_user_credentials().then(({ email, password }) => {
        authBody(email, "weak", { invite_code: "whatever-code" }).then((body) =>
          post("/api/auth/register", body).then((r) => expect400(r, "weak password")),
        );
        authBody(email, password, { invite_code: "short" }).then((body) =>
          post("/api/auth/register", body).then((r) => expect400(r, "invite code too short")),
        );
        authBody(email, password, { invite_code: "bad!!code!!" }).then((body) =>
          post("/api/auth/register", body).then((response) => {
            expect400(response, "invite code format");
            expect(String(response.body.message).toLowerCase()).to.include("format");
          }),
        );
        authBody(email, password, { invite_code: "never-issued-code-xyz" }).then(
          (body) =>
            post("/api/auth/register", body).then((response) => {
              expect(response.status, "unknown invite code").to.eq(404);
              expect(response.body.success).to.eq(false);
            }),
        );
        cy.is_invite_code_required().then((required: boolean) => {
          if (!required) {
            cy.log("invite_code_required is off; skipping the missing-code assertion");
            return;
          }
          authBody(email, password).then((body) =>
            post("/api/auth/register", body).then((response) => {
              expect400(response, "invite code required");
              expect(String(response.body.message).toLowerCase()).to.include("required");
            }),
          );
        });
      });
    });

    it("refuses registration while already signed in", () => {
      cy.generate_random_test_user_credentials().then((existing) => {
        cy.create_and_login_as_regular_user_via_request(existing).then(
          (ok: boolean) => expect(ok).to.be.true,
        );
        cy.generate_random_test_user_credentials().then(({ email, password }) => {
          authBody(email, password, { invite_code: "whatever-code" }).then((body) =>
            post("/api/auth/register", body).then((response) => {
              expect(response.status).to.eq(403);
              expect(response.body.success).to.eq(false);
            }),
          );
        });
      });
    });
  });

  describe("password reset and email verification bodies", () => {
    it("POST /api/auth/reset-password/request validates the body", () => {
      post("/api/auth/reset-password/request", "{not json", {
        "content-type": "application/json",
      }).then((r) => expect400(r, "non-JSON"));
      post("/api/auth/reset-password/request", { email: 123 }).then((r) =>
        expect400(r, "non-string email"),
      );
      post("/api/auth/reset-password/request", {
        email: "someone@example.com",
        unexpected: true,
      }).then((r) => expect400(r, "unknown key"));
    });

    it("POST /api/auth/reset-password/confirm validates the token and the new password", () => {
      post("/api/auth/reset-password/confirm", "{not json", {
        "content-type": "application/json",
      }).then((r) => expect400(r, "non-JSON"));
      post("/api/auth/reset-password/confirm", {
        token: "not-a-guid",
        new_password: "Sufficiently-Strong-1!",
      }).then((r) => expect400(r, "non-GUID token"));
      post("/api/auth/reset-password/confirm", {
        token: generateV4Uuid(),
        new_password: "weak",
      }).then((response) => {
        expect400(response, "weak password");
        expect(response.body.errors, "zod issues").to.be.an("array").and.not.be.empty;
      });
    });

    it("POST /api/auth/verify-email/{request,confirm} validate their bodies", () => {
      post("/api/auth/verify-email/request", "{not json", {
        "content-type": "application/json",
      }).then((r) => expect400(r, "request non-JSON"));
      post("/api/auth/verify-email/request", { email: 123 }).then((r) =>
        expect400(r, "request non-string email"),
      );
      post("/api/auth/verify-email/confirm", "{not json", {
        "content-type": "application/json",
      }).then((r) => expect400(r, "confirm non-JSON"));
      post("/api/auth/verify-email/confirm", { token: "not-a-guid" }).then((r) =>
        expect400(r, "confirm non-GUID token"),
      );
    });
  });

  describe("POST /api/auth/session/generate-authorization-code", () => {
    it("validates the body and binds the code to a registered redirect_uri", () => {
      createRegisteredClientApp().then((app_id) => {
        cy.generate_random_test_user_credentials().then((credentials) => {
          cy.create_and_login_as_regular_user_via_request(credentials).then(
            (ok: boolean) => expect(ok).to.be.true,
          );
          cy.request({
            method: "POST",
            url: `/api/apps/${app_id}/authorize`,
          }).then((response) => expect(response.status).to.eq(200));

          post("/api/auth/session/generate-authorization-code", "{not json", {
            "content-type": "application/json",
          }).then((r) => expect400(r, "non-JSON"));
          post("/api/auth/session/generate-authorization-code", {
            nope: true,
          }).then((r) => expect400(r, "invalid body"));

          createPkceChallenge().then((challenge) => {
            const base = {
              client_app_id: app_id,
              code_challenge: challenge.code_challenge,
              code_challenge_method: "S256",
              challenge_time: challenge.challenge_time,
              nonce: `e2e-nonce-${Date.now()}`,
              scope: DEFAULT_AUTH_SCOPE,
            };
            post("/api/auth/session/generate-authorization-code", {
              ...base,
              redirect_uri: UNREGISTERED_REDIRECT_URI,
            }).then((response) => {
              expect400(response, "unregistered redirect_uri");
              expect(response.body.error_id).to.eq("invalid_redirect_uri");
            });
            post("/api/auth/session/generate-authorization-code", base).then(
              (response) => {
                expect400(response, "missing redirect_uri for a third-party app");
                expect(response.body.error_id).to.eq("invalid_redirect_uri");
              },
            );
            post("/api/auth/session/generate-authorization-code", {
              ...base,
              redirect_uri: REGISTERED_REDIRECT_URI,
            }).then((response) => {
              expect(response.status).to.eq(200);
              expect(response.body.success).to.eq(true);
              expect(response.body.authorization_code).to.be.a("string");
            });
          });
        });
      });
    });
  });

  describe("/api/user/profile", () => {
    it("PUT validates the body and clears fields set to null", () => {
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request(credentials).then(
          (ok: boolean) => expect(ok).to.be.true,
        );
        cy.request<AuthResponseBody>({
          method: "PUT",
          url: "/api/user/profile",
          headers: { "content-type": "application/json" },
          body: "{not json",
          failOnStatusCode: false,
        }).then((r) => expect400(r, "non-JSON"));
        cy.request<AuthResponseBody>({
          method: "PUT",
          url: "/api/user/profile",
          body: { username: "not a valid username!" },
          failOnStatusCode: false,
        }).then((response) => {
          expect400(response, "invalid username");
          expect(response.body.issues, "issues").to.be.an("array").and.not.be.empty;
        });
        cy.request<AuthResponseBody>({
          method: "PUT",
          url: "/api/user/profile",
          body: { unexpected: true },
          failOnStatusCode: false,
        }).then((r) => expect400(r, "unknown key"));

        cy.request<AuthResponseBody>({
          method: "PUT",
          url: "/api/user/profile",
          body: { display_name: "E2E Display", first_name: "E2E" },
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.profile?.display_name).to.eq("E2E Display");
          expect(response.body.profile?.first_name).to.eq("E2E");
        });
        cy.request<AuthResponseBody>({
          method: "PUT",
          url: "/api/user/profile",
          body: { display_name: null },
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.profile?.display_name ?? null).to.eq(null);
        });
        cy.request<AuthResponseBody>({
          method: "GET",
          url: "/api/user/profile",
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.profile?.display_name ?? null).to.eq(null);
          expect(response.body.profile?.first_name).to.eq("E2E");
        });
      });
    });
  });
});
