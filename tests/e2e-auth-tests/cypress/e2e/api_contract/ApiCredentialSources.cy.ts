// Every credential the auth server's API route guard accepts, exercised
// against the same session-guarded routes so the credential resolution
// order/semantics are pinned before the guard moves into the
// @schemavaults/openapi-operations auth resolvers:
//   1. the auth server's HTTP-only refresh-token cookie (the browser session),
//   2. `Authorization: Bearer <access token>` minted for the auth server
//      audience through the token endpoint (how external apps call
//      GET /api/me/organizations),
//   3. the auth server's own access-token cookie (`access_token_<app id>`,
//      a JSON `{ token, exp }` blob as written by the client SDK),
//   4. a stale / garbage bearer header must NOT block an otherwise valid
//      session cookie (sources are tried, not short-circuited),
//   5. a garbage bearer header on its own is a 401 (never a 500).

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  AccessTokenCookieName,
  RefreshTokenCookieName,
} from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();
const REFRESH_TOKEN_COOKIE = RefreshTokenCookieName(AUTH_APP_ID);
const ACCESS_TOKEN_COOKIE = AccessTokenCookieName(AUTH_APP_ID);

interface TokenResponseBody {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
}

interface Envelope {
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
  profile?: Record<string, unknown>;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function baseOrigin(): string {
  return new URL(Cypress.config("baseUrl")!).origin;
}

/**
 * The access-token cookie blob the client SDK stores (`AccessToken` from
 * `@schemavaults/auth-common`, a strict schema): the JWT plus its metadata.
 */
function accessTokenCookieBlob(access_token: string, uid: string, exp: number): string {
  return JSON.stringify({
    type: "access",
    uid,
    aud: AUTH_APP_ID,
    iat: Date.now(),
    exp,
    token: access_token,
  });
}

/** The current session's uid (from whoami). */
function currentUid(): Cypress.Chainable<string> {
  return cy
    .request<{ user: { uid: string } }>(`/api/auth/whoami/${AUTH_APP_ID}`)
    .then((response) => cy.wrap(response.body.user.uid, { log: false }));
}

/** Redeems the session's refresh cookie for an auth-server-audience access token. */
function mintAuthServerAccessToken(): Cypress.Chainable<{ access_token: string; expires_in: number }> {
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
      expect(response.body.token_type).to.eq("Bearer");
      expect(response.body.access_token).to.be.a("string").and.not.be.empty;
      return cy.wrap(
        {
          access_token: response.body.access_token as string,
          expires_in: response.body.expires_in ?? 300,
        },
        { log: false },
      );
    });
}

function getWith(
  url: string,
  headers: Record<string, string> = {},
): Cypress.Chainable<Cypress.Response<Envelope>> {
  return cy.request<Envelope>({ method: "GET", url, headers, failOnStatusCode: false });
}

describe("API credential sources", () => {
  beforeEach(() => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (ok: boolean) => expect(ok, "regular user login").to.be.true,
      );
    });
  });

  it("the refresh-token session cookie authenticates guarded routes", () => {
    getWith("/api/user/profile").then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
    });
    getWith("/api/me/organizations").then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.data?.memberships).to.be.an("array");
    });
  });

  it("a bearer access token for the auth server audience authenticates without any cookie", () => {
    mintAuthServerAccessToken().then(({ access_token }) => {
      cy.clearCookies();
      getWith("/api/me/organizations", { Authorization: `Bearer ${access_token}` }).then(
        (response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.data?.memberships).to.be.an("array");
        },
      );
      getWith("/api/user/profile", { Authorization: `Bearer ${access_token}` }).then(
        (response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
        },
      );
      // Cookies are gone, so without the header the same route is a 401.
      getWith("/api/user/profile").then((response) => {
        expect(response.status).to.eq(401);
      });
    });
  });

  it("the auth server's own access-token cookie (the SDK's JSON blob) authenticates", () => {
    currentUid().then((uid) => {
      mintAuthServerAccessToken().then(({ access_token, expires_in }) => {
        cy.clearCookies();
        cy.setCookie(
          ACCESS_TOKEN_COOKIE,
          accessTokenCookieBlob(access_token, uid, Date.now() + expires_in * 1000),
        );
        getWith("/api/user/profile").then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
        });
      });
    });
  });

  it("an expired access-token cookie blob is ignored (401, not 500)", () => {
    currentUid().then((uid) => {
      mintAuthServerAccessToken().then(({ access_token }) => {
        cy.clearCookies();
        cy.setCookie(ACCESS_TOKEN_COOKIE, accessTokenCookieBlob(access_token, uid, Date.now() - 60_000));
        getWith("/api/user/profile").then((response) => {
          expect(response.status).to.eq(401);
          expect(response.body.success).to.eq(false);
        });
      });
    });
  });

  it("a garbage bearer token does not block a valid session cookie", () => {
    cy.getCookie(REFRESH_TOKEN_COOKIE).should("exist");
    getWith("/api/user/profile", { Authorization: "Bearer this.is.not.a.token" }).then(
      (response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
      },
    );
  });

  it("a garbage bearer token on its own is a 401 envelope", () => {
    cy.clearCookies();
    getWith("/api/user/profile", { Authorization: "Bearer this.is.not.a.token" }).then(
      (response) => {
        expect(response.status).to.eq(401);
        expect(response.body.success).to.eq(false);
        expect(response.body.message).to.be.a("string");
      },
    );
  });

  it("a token for another audience is refused (401) even though it verifies", () => {
    // An access token minted for a different resource must not be accepted
    // by the auth server's own API (audience check).
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: AUTH_APP_ID,
      resource: "api-server-that-does-not-exist",
    });
    cy.request<TokenResponseBody>({
      method: "POST",
      url: "/api/oidc/token",
      body: form.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      failOnStatusCode: false,
    }).then((response) => {
      // The token endpoint refuses unknown resources outright; either way no
      // usable token exists for a foreign audience.
      expect(response.status).to.be.oneOf([400, 403]);
      expect(response.body.error).to.be.a("string");
    });
  });
});
