// Verifies that authentication sessions are scoped to the deployment's
// custom SCHEMAVAULTS_AUTH_SERVER_APP_ID (injected for this suite by
// e2e-auth-tests-cli.ts) rather than the default 'schemavaults-auth' id:
//   - login/logout works end-to-end under the custom app id (the helper
//     commands build app-id-scoped token endpoint URLs from Cypress env)
//   - refresh-token cookies carry the custom app id suffix, and no
//     default-id cookies are created
//   - the whoami endpoint responds for the custom app id, not the default

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-common";
import { DEFAULT_AUTH_SERVER_APP_ID } from "@schemavaults/app-definitions";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

describe("White-label custom app id sessions", () => {
  it("superuser can log in via the UI with cookies scoped to the custom app id", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }

      cy.url().should("include", "/account");
      cy.getCookie(RefreshTokenCookieName(AUTH_APP_ID)).should("exist");
      cy.getCookie(RefreshTokenExpiryCookieName(AUTH_APP_ID)).should("exist");
      // No cookies under the default app id should exist on a white-label
      // deployment.
      cy.getCookie(RefreshTokenCookieName(DEFAULT_AUTH_SERVER_APP_ID)).should(
        "not.exist",
      );
      cy.getCookie(
        RefreshTokenExpiryCookieName(DEFAULT_AUTH_SERVER_APP_ID),
      ).should("not.exist");

      cy.logout();
      cy.getCookie(RefreshTokenCookieName(AUTH_APP_ID)).should("not.exist");
    });
  });

  it("request-based login sets only custom-app-id-scoped cookies", () => {
    cy.create_and_login_as_superuser_via_request().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser via request");
      }

      cy.getCookie(RefreshTokenCookieName(AUTH_APP_ID)).should("exist");
      cy.getCookie(RefreshTokenExpiryCookieName(AUTH_APP_ID)).should("exist");
      cy.getCookie(RefreshTokenCookieName(DEFAULT_AUTH_SERVER_APP_ID)).should(
        "not.exist",
      );
    });
  });

  it("whoami is scoped to the custom app id", () => {
    cy.create_and_login_as_superuser_via_request().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser via request");
      }

      cy.request({
        method: "GET",
        url: `/api/auth/whoami/${AUTH_APP_ID}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property("user");
        expect(response.body.user).to.have.property(
          "email",
          Cypress.env("PRIVATE_SUPERUSER_EMAIL"),
        );
        expect(response.body.user).to.have.property("admin", true);
      });

      // The default app id is not a known app on this white-label
      // deployment, so whoami must not report an authenticated superuser
      // for it. Kept deliberately loose (not-an-authenticated-success)
      // to avoid coupling to exact 400-vs-401 semantics.
      cy.request({
        method: "GET",
        url: `/api/auth/whoami/${DEFAULT_AUTH_SERVER_APP_ID}`,
        failOnStatusCode: false,
      }).then((response) => {
        const authenticated_user =
          response.status === 200 &&
          typeof response.body === "object" &&
          response.body !== null &&
          "user" in response.body &&
          Boolean(response.body.user);
        expect(
          authenticated_user,
          "whoami for the default app id should not return an authenticated user",
        ).to.be.false;
      });
    });
  });
});
