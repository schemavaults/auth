// Covers the SDK-facing extensions of the standard OIDC token endpoint
// (POST /api/oidc/token) that @schemavaults/auth-client-sdk relies on
// now that it redeems codes and refresh tokens there via openid-client:
//
//   - RFC 8707 `resource`: the single access_token is minted for the
//     requested audience (here: the auth server itself), one per request;
//   - the refresh grant accepts the platform's per-client-app HTTP-only
//     refresh-token cookie when the form carries no `refresh_token`;
//   - refresh tokens for the auth server's own app are always delivered
//     as that cookie (omitted from the JSON body) with a
//     `refresh_token_expires_in` hint;
//   - browser callers from a registered origin get a credentialed CORS
//     allowance (echoed origin + Allow-Credentials), while unregistered
//     origins are refused before any grant work.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-common";

const APP_ID = getAuthServerAppIdFromCypressEnv();
const REFRESH_TOKEN_COOKIE = RefreshTokenCookieName(APP_ID);
const REFRESH_TOKEN_EXPIRY_COOKIE = RefreshTokenExpiryCookieName(APP_ID);

interface OidcTokenResponseBody {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

function baseOrigin(): string {
  return new URL(Cypress.config("baseUrl")!).origin;
}

/**
 * POSTs a form-encoded token request. `body` is sent verbatim so tests
 * can repeat parameters (e.g. two `resource` values).
 */
function postTokenRequest(
  body: string,
  extraHeaders: Record<string, string> = {},
): Cypress.Chainable<Cypress.Response<OidcTokenResponseBody>> {
  return cy.request<OidcTokenResponseBody>({
    method: "POST",
    url: "/api/oidc/token",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      ...extraHeaders,
    },
    failOnStatusCode: false,
  });
}

function refreshGrantForm(params: Record<string, string>): string {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: APP_ID,
    ...params,
  });
  return form.toString();
}

describe("OIDC token endpoint: SDK extensions", () => {
  beforeEach(() => {
    cy.reset_rate_limit();
  });

  it("redeems the HTTP-only refresh cookie for an auth-server-audience access token and rotates the cookie", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success, "create_and_login_as_regular_user should succeed").to
          .be.true;

        cy.getCookie(REFRESH_TOKEN_COOKIE)
          .should("exist")
          .then((cookie) => {
            if (!cookie || !cookie.value) {
              throw new Error("Refresh token cookie not found after login");
            }
            const originalToken: string = cookie.value;

            postTokenRequest(
              refreshGrantForm({
                resource: Cypress.env("AUTH_SERVER_URL"),
                refresh_token_delivery: "http_only_cookie",
              }),
              { Origin: baseOrigin() },
            ).then((response) => {
              expect(response.status, "status").to.eq(200);
              expect(response.body.token_type, "token_type").to.eq("Bearer");
              expect(response.body.access_token, "access_token").to.be.a(
                "string",
              ).and.not.be.empty;
              expect(response.body.expires_in, "expires_in").to.be.a("number");
              expect(response.body.scope, "scope").to.include("openid");
              // First-party app: the refresh token is cookie-delivered and
              // never inlined, but its lifetime is still reported.
              expect(response.body.refresh_token, "refresh_token").to.be
                .undefined;
              expect(
                response.body.refresh_token_expires_in,
                "refresh_token_expires_in",
              ).to.be.a("number").and.be.greaterThan(0);
              // Credentialed CORS for the registered origin.
              expect(
                response.headers["access-control-allow-origin"],
                "Access-Control-Allow-Origin",
              ).to.eq(baseOrigin());
              expect(
                response.headers["access-control-allow-credentials"],
                "Access-Control-Allow-Credentials",
              ).to.eq("true");
              expect(response.headers["cache-control"], "Cache-Control").to.eq(
                "no-store",
              );
            });

            cy.getCookie(REFRESH_TOKEN_COOKIE)
              .should("exist")
              .then((rotated) => {
                expect(
                  rotated?.value,
                  "Redemption must rotate the refresh token cookie",
                ).to.be.a("string").and.not.eq(originalToken);
              });
            cy.getCookie(REFRESH_TOKEN_EXPIRY_COOKIE).should("exist");
          });
      });
    });
  });

  it("rejects more than one resource, and unknown resources", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success).to.be.true;

        postTokenRequest(
          refreshGrantForm({}) +
            `&resource=${encodeURIComponent(Cypress.env("AUTH_SERVER_URL"))}` +
            `&resource=${encodeURIComponent("some-other-api")}`,
        ).then((response) => {
          expect(response.status, "status").to.eq(400);
          expect(response.body.error, "error").to.eq("invalid_target");
        });

        postTokenRequest(
          refreshGrantForm({ resource: "api-server-that-does-not-exist" }),
        ).then((response) => {
          expect(response.status, "status").to.eq(400);
          expect(response.body.error, "error").to.eq("invalid_target");
        });

        // The session must survive the rejected requests.
        cy.getCookie(REFRESH_TOKEN_COOKIE).should("exist");
      });
    });
  });

  it("refuses browser callers from an origin the client app has not registered", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success).to.be.true;

        postTokenRequest(
          refreshGrantForm({ resource: Cypress.env("AUTH_SERVER_URL") }),
          { Origin: "https://attacker.example" },
        ).then((response) => {
          expect(response.status, "status").to.eq(403);
          expect(response.body.error, "error").to.eq("invalid_request");
          expect(
            response.headers["access-control-allow-origin"],
            "Access-Control-Allow-Origin",
          ).to.not.eq("https://attacker.example");
        });

        // Refused before the grant ran: the cookie was not rotated away.
        cy.getCookie(REFRESH_TOKEN_COOKIE).should("exist");
      });
    });
  });

  it("requires a refresh token when neither the form nor the cookie carries one", () => {
    cy.clearCookies();
    postTokenRequest(refreshGrantForm({})).then((response) => {
      expect(response.status, "status").to.eq(400);
      expect(response.body.error, "error").to.eq("invalid_request");
      expect(response.body.error_description, "error_description").to.include(
        "refresh_token",
      );
    });
  });
});
