// CORS contracts of the per-client-app auth endpoints that browsers hit
// cross-origin. The preflight handlers of the logout and legacy token
// endpoints had no coverage at all, and the authenticated whoami request
// from a foreign origin (the strict-CORS 403) was never exercised:
//   OPTIONS /api/auth/logout/[client_app_id]
//   OPTIONS /api/auth/token/authorization_code/[client_app_id]
//   OPTIONS /api/auth/token/refresh_token/[client_app_id]
//   OPTIONS /api/auth/whoami/[client_app_id]   (malformed id, foreign origin)
//   GET     /api/auth/whoami/[client_app_id]   (authenticated: 403 foreign
//                                              origin, 200 + CORS own origin,
//                                              400 malformed id)
//   POST    /api/auth/logout/[client_app_id]   (400/404/403 branches, 200 with
//                                              CORS headers and cleared cookies)

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();
const UNKNOWN_APP_ID = "00000000-0000-0000-0000-000000000001";
const FOREIGN_ORIGIN = "https://attacker.example";

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function ownOrigin(): string {
  return new URL(Cypress.config("baseUrl")!).origin;
}

function preflight(
  url: string,
  headers: Record<string, string> = {},
): Cypress.Chainable<Cypress.Response<unknown>> {
  return cy.request({
    method: "OPTIONS",
    url,
    headers,
    failOnStatusCode: false,
  });
}

describe("Auth endpoint CORS preflights", () => {
  const preflightEndpoints = [
    "/api/auth/logout",
    "/api/auth/token/authorization_code",
    "/api/auth/token/refresh_token",
    "/api/auth/whoami",
  ];

  for (const base of preflightEndpoints) {
    describe(`OPTIONS ${base}/:client_app_id`, () => {
      it("returns 400 for a malformed client_app_id", () => {
        preflight(`${base}/bad%20id`).then((response) => {
          expect(response.status).to.eq(400);
        });
      });

      it("returns 403 for an origin not registered for the app", () => {
        preflight(`${base}/${AUTH_APP_ID}`, { Origin: FOREIGN_ORIGIN }).then(
          (response) => {
            expect(response.status).to.eq(403);
            expect(response.body).to.have.property("success", false);
          },
        );
      });

      it("answers 204 with credentialed CORS headers for the app's own origin", () => {
        preflight(`${base}/${AUTH_APP_ID}`, { Origin: ownOrigin() }).then(
          (response) => {
            expect(response.status).to.eq(204);
            expect(response.headers["access-control-allow-origin"]).to.eq(
              ownOrigin(),
            );
            expect(response.headers["access-control-allow-credentials"]).to.eq(
              "true",
            );
            expect(String(response.headers["vary"])).to.include("Origin");
          },
        );
      });
    });
  }

  it("OPTIONS /api/auth/logout/:client_app_id: 204 without an Origin header, 404 for an unknown app", () => {
    preflight(`/api/auth/logout/${AUTH_APP_ID}`).then((response) => {
      expect(response.status, "no Origin header (non-browser caller)").to.eq(204);
    });
    preflight(`/api/auth/logout/${UNKNOWN_APP_ID}`, {
      Origin: FOREIGN_ORIGIN,
    }).then((response) => {
      expect(response.status, "unknown app").to.eq(404);
    });
    preflight(`/api/auth/logout/${AUTH_APP_ID}`, { Origin: ownOrigin() }).then(
      (response) => {
        expect(response.headers["access-control-allow-methods"]).to.include(
          "POST",
        );
      },
    );
  });
});

describe("GET /api/auth/whoami/:client_app_id CORS while authenticated", () => {
  beforeEach(() => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (ok: boolean) => expect(ok).to.be.true,
      );
    });
  });

  it("refuses an authenticated request from a foreign origin with 403", () => {
    cy.request({
      method: "GET",
      url: `/api/auth/whoami/${AUTH_APP_ID}`,
      headers: { Origin: FOREIGN_ORIGIN },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("serves an authenticated request from the app's own origin with CORS headers", () => {
    cy.request({
      method: "GET",
      url: `/api/auth/whoami/${AUTH_APP_ID}`,
      headers: { Origin: ownOrigin() },
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.user).to.be.an("object");
      expect(response.headers["access-control-allow-origin"]).to.eq(ownOrigin());
      expect(response.headers["access-control-allow-credentials"]).to.eq("true");
    });
  });

  it("returns 400 for a malformed client_app_id even when authenticated", () => {
    cy.request({
      method: "GET",
      url: "/api/auth/whoami/bad%20id",
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400);
    });
  });
});

describe("POST /api/auth/logout/:client_app_id", () => {
  it("validates the app and the Origin before clearing anything", () => {
    cy.request({
      method: "POST",
      url: "/api/auth/logout/bad%20id",
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "malformed app id").to.eq(400);
    });
    cy.request({
      method: "POST",
      url: `/api/auth/logout/${UNKNOWN_APP_ID}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "unknown app").to.eq(404);
    });
    cy.request({
      method: "POST",
      url: `/api/auth/logout/${AUTH_APP_ID}`,
      headers: { Origin: FOREIGN_ORIGIN },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "foreign origin").to.eq(403);
    });
    cy.request({
      method: "POST",
      url: `/api/auth/logout/${AUTH_APP_ID}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "web app without an Origin header").to.eq(403);
    });
  });

  it("clears the refresh-token cookies and echoes CORS headers for the app's own origin", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (ok: boolean) => expect(ok).to.be.true,
      );
      cy.getCookie(RefreshTokenCookieName(AUTH_APP_ID)).should("exist");
      cy.request({
        method: "POST",
        url: `/api/auth/logout/${AUTH_APP_ID}`,
        headers: { Origin: ownOrigin() },
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property("success", true);
        expect(response.headers["access-control-allow-origin"]).to.eq(ownOrigin());
        expect(response.headers["access-control-allow-credentials"]).to.eq("true");
      });
      cy.getCookie(RefreshTokenCookieName(AUTH_APP_ID)).should("not.exist");
      cy.getCookie(RefreshTokenExpiryCookieName(AUTH_APP_ID)).should("not.exist");
      cy.is_authenticated().should("eq", false);
    });
  });
});
