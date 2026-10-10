// The auth server's access and refresh tokens for its own audience share
// `aud`, `iss`, keyset and subject; only their `type` claim tells them
// apart. This spec pins that the API never confuses the two:
//   1. the session's refresh token (the HTTP-only cookie's value) presented
//      as `Authorization: Bearer` is a 401 — the per-app refresh token must
//      not unlock the first-party API that only access tokens may call;
//   2. an auth-server-audience access token presented to the token endpoint
//      as `grant_type=refresh_token` is `invalid_grant` — a short-lived
//      access token must not be upgraded into a two-week refresh token;
//   3. (control) each token keeps working as the type it was minted as.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import { RefreshTokenCookieName } from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();
const REFRESH_TOKEN_COOKIE = RefreshTokenCookieName(AUTH_APP_ID);

interface TokenResponseBody {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface Envelope {
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function baseOrigin(): string {
  return new URL(Cypress.config("baseUrl")!).origin;
}

function getWith(
  url: string,
  headers: Record<string, string> = {},
): Cypress.Chainable<Cypress.Response<Envelope>> {
  return cy.request<Envelope>({ method: "GET", url, headers, failOnStatusCode: false });
}

/** The session's refresh token: the value of the auth server's HTTP-only cookie. */
function currentRefreshToken(): Cypress.Chainable<string> {
  return cy
    .getCookie(REFRESH_TOKEN_COOKIE)
    .should("exist")
    .then((cookie) => {
      if (!cookie || !cookie.value) {
        throw new Error("Refresh token cookie not found after login");
      }
      return cy.wrap(cookie.value, { log: false });
    });
}

/** Redeems the session's refresh cookie for an auth-server-audience access token. */
function mintAuthServerAccessToken(): Cypress.Chainable<string> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: AUTH_APP_ID,
    resource: Cypress.env("AUTH_SERVER_URL"),
    refresh_token_delivery: "http_only_cookie",
  });
  return cy
    .request<TokenResponseBody>({
      method: "POST",
      url: "/api/oidc/token",
      body: form.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Origin: baseOrigin(),
      },
    })
    .then((response) => {
      expect(response.status, "token endpoint status").to.eq(200);
      expect(response.body.access_token).to.be.a("string").and.not.be.empty;
      return cy.wrap(response.body.access_token as string, { log: false });
    });
}

/** Presents `presented_token` to the refresh grant as if it were a refresh token. */
function redeemAsRefreshToken(
  presented_token: string,
): Cypress.Chainable<Cypress.Response<TokenResponseBody>> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: AUTH_APP_ID,
    refresh_token: presented_token,
  });
  return cy.request<TokenResponseBody>({
    method: "POST",
    url: "/api/oidc/token",
    body: form.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Origin: baseOrigin(),
    },
    failOnStatusCode: false,
  });
}

describe("API token type separation (access vs refresh)", () => {
  beforeEach(() => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (ok: boolean) => expect(ok, "regular user login").to.be.true,
      );
    });
  });

  it("a refresh token presented as a bearer access token is refused (401)", () => {
    currentRefreshToken().then((refresh_token) => {
      // Control: the token is live — as the session cookie it authenticates.
      getWith("/api/user/profile").then((response) => {
        expect(response.status).to.eq(200);
      });

      cy.clearCookies();
      const headers = { Authorization: `Bearer ${refresh_token}` };
      getWith("/api/user/profile", headers).then((response) => {
        expect(response.status).to.eq(401);
        expect(response.body.success).to.eq(false);
      });
      getWith("/api/me/organizations", headers).then((response) => {
        expect(response.status).to.eq(401);
        expect(response.body.success).to.eq(false);
      });
      // Admin surface: never reachable with a refresh token either (401,
      // not 403 — the credential resolves nobody at all).
      getWith("/api/admin/users/list", headers).then((response) => {
        expect(response.status).to.eq(401);
      });
    });
  });

  it("an auth-server access token presented as a refresh token is refused (invalid_grant)", () => {
    mintAuthServerAccessToken().then((access_token) => {
      cy.clearCookies();

      // Control: as a bearer access token it authenticates.
      getWith("/api/user/profile", { Authorization: `Bearer ${access_token}` }).then(
        (response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
        },
      );

      redeemAsRefreshToken(access_token).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.error).to.eq("invalid_grant");
        expect(response.body).to.not.have.property("access_token");
        expect(response.body).to.not.have.property("refresh_token");
      });
      cy.getCookie(REFRESH_TOKEN_COOKIE).should("not.exist");
    });
  });

  it("(control) the genuine refresh token still redeems at the refresh grant", () => {
    currentRefreshToken().then((refresh_token) => {
      cy.clearCookies();
      redeemAsRefreshToken(refresh_token).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.access_token).to.be.a("string").and.not.be.empty;
      });
    });
  });
});
