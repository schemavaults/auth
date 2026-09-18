// Request-level coverage of the admin user-management endpoints that only had
// their denial paths (401/403) covered:
//   POST   /api/admin/promote/[uid]
//   POST   /api/admin/users/[uid]/disable      (disable)
//   DELETE /api/admin/users/[uid]/disable      (re-enable)
//   DELETE /api/admin/users/[uid]
//   POST   /api/admin/users/[uid]/resend-verification (404 + 400 only; the
//          200 path needs a configured mail server, which the E2E stack
//          does not have)
// Each endpoint's success path is verified through its observable effect on
// the target account (a subsequent login attempt), not just the response
// body, so the contract survives the planned OpenAPI migration intact.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface WhoamiResponseBody {
  success: boolean;
  user?: { uid: string; email: string; admin: boolean };
}

interface AdminActionResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
}

interface LoginResponseBody {
  kind?: string;
  success?: boolean;
  message?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const NONEXISTENT_UID = "00000000-0000-0000-0000-000000000099";
const MALFORMED_UID = "not-a-uuid";

/** Registers a fresh regular user (via request) and yields their uid + creds. */
function createRegularUser(): Cypress.Chainable<{
  uid: string;
  email: string;
  password: string;
}> {
  return cy.generate_random_test_user_credentials().then((credentials) => {
    return cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((created: boolean) => {
        expect(created, "regular user registration should succeed").to.be.true;
        return cy
          .request<WhoamiResponseBody>({
            method: "GET",
            url: `/api/auth/whoami/${AUTH_APP_ID}`,
          })
          .then((whoami) => {
            expect(whoami.status).to.eq(200);
            const uid = whoami.body.user?.uid;
            if (!uid) {
              throw new Error("whoami did not return the new user's uid");
            }
            cy.logout();
            return cy.wrap({ uid, ...credentials }, { log: false });
          });
      });
  });
}

function loginAsSuperuser(): void {
  cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
    if (!ok) throw new Error("Failed to login as superuser");
  });
}

/** Raw POST /api/auth/login so the response body can be inspected. */
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
          nonce: `e2e-nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          scope: DEFAULT_AUTH_SCOPE,
        },
      }),
    );
}

describe("Admin user lifecycle API", () => {
  describe("POST /api/admin/promote/:uid", () => {
    beforeEach(loginAsSuperuser);

    it("returns 400 for a malformed uid", () => {
      cy.request<AdminActionResponseBody>({
        method: "POST",
        url: `/api/admin/promote/${MALFORMED_UID}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
      });
    });

    it("returns 404 for a uid that does not exist", () => {
      cy.request<AdminActionResponseBody>({
        method: "POST",
        url: `/api/admin/promote/${NONEXISTENT_UID}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(404);
        expect(response.body.success).to.eq(false);
      });
    });
  });

  it("POST /api/admin/promote/:uid promotes a regular user to admin", () => {
    createRegularUser().then(({ uid, email, password }) => {
      loginAsSuperuser();
      cy.request<AdminActionResponseBody>({
        method: "POST",
        url: `/api/admin/promote/${uid}`,
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.resource_id).to.eq(uid);
      });
      cy.logout();

      // The promoted account now reports admin=true on whoami.
      cy.login_via_request(email, password).then((ok: boolean) => {
        expect(ok, "promoted user should still log in").to.be.true;
        cy.is_admin().should("eq", true);
      });
    });
  });

  describe("POST/DELETE /api/admin/users/:uid/disable", () => {
    it("rejects a malformed uid (400) and an unknown uid (404)", () => {
      loginAsSuperuser();
      cy.request({
        method: "DELETE",
        url: `/api/admin/users/${MALFORMED_UID}/disable`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body).to.have.property("success", false);
      });
      cy.request({
        method: "POST",
        url: `/api/admin/users/${NONEXISTENT_UID}/disable`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(404);
        expect(response.body).to.have.property("success", false);
      });
      cy.request({
        method: "DELETE",
        url: `/api/admin/users/${NONEXISTENT_UID}/disable`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(404);
        expect(response.body).to.have.property("success", false);
      });
    });

    it("re-enables a disabled user so they can log in again", () => {
      createRegularUser().then(({ uid, email, password }) => {
        loginAsSuperuser();
        cy.request<AdminActionResponseBody>({
          method: "POST",
          url: `/api/admin/users/${uid}/disable`,
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.resource_id).to.eq(uid);
        });
        cy.logout();

        attemptLogin(email, password).then((response) => {
          expect(response.status, "disabled user login").to.eq(403);
          expect(response.body.kind).to.eq("failure");
        });

        loginAsSuperuser();
        cy.request<AdminActionResponseBody>({
          method: "DELETE",
          url: `/api/admin/users/${uid}/disable`,
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.resource_id).to.eq(uid);
          expect(String(response.body.message).toLowerCase()).to.include(
            "enabled",
          );
        });
        cy.logout();

        attemptLogin(email, password).then((response) => {
          expect(response.status, "re-enabled user login").to.eq(200);
          expect(response.body.kind).to.eq("authenticated");
        });
      });
    });
  });

  describe("DELETE /api/admin/users/:uid", () => {
    it("returns 400 when an admin targets their own account", () => {
      loginAsSuperuser();
      cy.request<WhoamiResponseBody>({
        method: "GET",
        url: `/api/auth/whoami/${AUTH_APP_ID}`,
      }).then((whoami) => {
        const own_uid = whoami.body.user?.uid;
        if (!own_uid) throw new Error("whoami did not return the admin uid");
        cy.request({
          method: "DELETE",
          url: `/api/admin/users/${own_uid}`,
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.eq(400);
          expect(response.body).to.have.property("success", false);
        });
      });
    });

    it("returns 404 for an unknown uid", () => {
      loginAsSuperuser();
      cy.request({
        method: "DELETE",
        url: `/api/admin/users/${NONEXISTENT_UID}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(404);
        expect(response.body).to.have.property("success", false);
      });
    });

    it("deletes a user, after which they no longer exist or can log in", () => {
      createRegularUser().then(({ uid, email, password }) => {
        loginAsSuperuser();
        cy.request<AdminActionResponseBody>({
          method: "DELETE",
          url: `/api/admin/users/${uid}`,
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.resource_id).to.eq(uid);
        });

        cy.request({ method: "GET", url: "/api/admin/users/list" }).then(
          (listResponse) => {
            expect(listResponse.status).to.eq(200);
            const users: Array<{ uid: string }> =
              listResponse.body.data.users;
            expect(
              users.some((u) => u.uid === uid),
              "deleted user should be absent from the admin list",
            ).to.eq(false);
          },
        );
        cy.logout();

        attemptLogin(email, password).then((response) => {
          expect(response.status, "deleted user login").to.eq(401);
        });
      });
    });
  });

  describe("POST /api/admin/users/:uid/resend-verification", () => {
    beforeEach(loginAsSuperuser);

    it("returns 400 for a malformed uid", () => {
      cy.request({
        method: "POST",
        url: `/api/admin/users/${MALFORMED_UID}/resend-verification`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body).to.have.property("success", false);
      });
    });

    it("returns 404 for an unknown uid", () => {
      cy.request({
        method: "POST",
        url: `/api/admin/users/${NONEXISTENT_UID}/resend-verification`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(404);
        expect(response.body).to.have.property("success", false);
      });
    });
  });
});
