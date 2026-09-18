// Contract coverage of the legacy (non-OIDC) JSON token endpoints, which
// redeem the same authorization codes as /api/oidc/token but had almost no
// direct coverage (only one redirect_uri probe and the refresh-rotation
// suite):
//   POST /api/auth/token/authorization_code/[client_app_id]
//        -> success shape (refresh delivered as an HTTP-only cookie, nonce
//           echoed), code replay (400), route/body client_app_id mismatch,
//           grant_type mismatch, malformed body / app id
//   POST /api/auth/token/refresh_token/[client_app_id]
//        -> success from the cookie, 401 without any refresh token, 400 on
//           grant_type / client_app_id mismatch, 403 for a web app without
//           an Origin header

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface LegacyTokenResponseBody {
  success?: boolean;
  error?: boolean;
  message?: string;
  client_app_id?: string;
  nonce?: string | null;
  tokens?: {
    access?: string;
    refresh?: string;
    refresh_token_expiry?: number;
  };
  userData?: Record<string, unknown>;
  userOrgs?: unknown;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function ownOrigin(): string {
  return new URL(Cypress.config("baseUrl")!).origin;
}

interface MintedCode {
  code: string;
  code_verifier: string;
  challenge_time: number;
  nonce: string;
}

/** Registers a user and logs in with a locally generated PKCE pair. */
function registerAndMintCode(): Cypress.Chainable<MintedCode> {
  return cy.generate_random_test_user_credentials().then((credentials) =>
    cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((ok: boolean) => {
        expect(ok).to.be.true;
        cy.logout();
        cy.reset_rate_limit();
        const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
        const nonce = `e2e-nonce-${Date.now()}`;
        return cy
          .wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
            PKCE_ProofKeyManager.createCodeChallenge(verifier),
            { log: false },
          )
          .then((challenge) =>
            cy
              .request({
                method: "POST",
                url: "/api/auth/login",
                body: {
                  credentials,
                  client_app_id: AUTH_APP_ID,
                  code_challenge: challenge.code_challenge,
                  challenge_time: challenge.challenge_time,
                  nonce,
                  scope: DEFAULT_AUTH_SCOPE,
                },
              })
              .then((login) => {
                expect(login.status).to.eq(200);
                expect(login.body.kind).to.eq("authenticated");
                // Drop the login-issued session so the token endpoints are
                // exercised from a clean cookie jar.
                cy.clearCookies();
                return {
                  code: login.body.authorization_code as string,
                  code_verifier: verifier.code_verifier,
                  challenge_time: challenge.challenge_time,
                  nonce,
                };
              }),
          );
      }),
  );
}

function postToken(
  path: string,
  body: Cypress.RequestBody,
  headers: Record<string, string> = { Origin: ownOrigin() },
): Cypress.Chainable<Cypress.Response<LegacyTokenResponseBody>> {
  return cy.request<LegacyTokenResponseBody>({
    method: "POST",
    url: path,
    body,
    headers,
    failOnStatusCode: false,
  });
}

describe("Legacy token endpoints", () => {
  describe("POST /api/auth/token/authorization_code/:client_app_id", () => {
    it("redeems an authorization code once, delivering the refresh token as an HTTP-only cookie", () => {
      registerAndMintCode().then((minted) => {
        const body = {
          grant_type: "authorization_code",
          audience: Cypress.env("AUTH_SERVER_URL"),
          client_app_id: AUTH_APP_ID,
          code: minted.code,
          code_verifier: minted.code_verifier,
          challenge_time: minted.challenge_time,
        };
        postToken(`/api/auth/token/authorization_code/${AUTH_APP_ID}`, body).then(
          (response) => {
            expect(response.status).to.eq(200);
            expect(response.body.success).to.eq(true);
            expect(response.body.client_app_id).to.eq(AUTH_APP_ID);
            expect(response.body.nonce, "nonce is echoed").to.eq(minted.nonce);
            expect(response.body.tokens?.access).to.be.a("string");
            expect(response.body.tokens?.refresh).to.eq("AS_HTTP_ONLY_COOKIE");
            expect(response.body.tokens?.refresh_token_expiry).to.be.a("number");
            expect(response.body.userData).to.be.an("object");
          },
        );
        cy.getCookie(RefreshTokenCookieName(AUTH_APP_ID)).should("exist");
        cy.getCookie(RefreshTokenExpiryCookieName(AUTH_APP_ID)).should("exist");

        postToken(`/api/auth/token/authorization_code/${AUTH_APP_ID}`, body).then(
          (response) => {
            expect(response.status, "code replay").to.eq(400);
            expect(response.body.success).to.eq(false);
          },
        );
      });
    });

    it("rejects mismatched, malformed and wrong-grant requests with 400", () => {
      registerAndMintCode().then((minted) => {
        const valid = {
          grant_type: "authorization_code",
          audience: Cypress.env("AUTH_SERVER_URL"),
          client_app_id: AUTH_APP_ID,
          code: minted.code,
          code_verifier: minted.code_verifier,
          challenge_time: minted.challenge_time,
        };
        postToken(`/api/auth/token/authorization_code/${AUTH_APP_ID}`, {
          ...valid,
          client_app_id: "some-other-app",
        }).then((r) => expect(r.status, "route/body client_app_id mismatch").to.eq(400));
        postToken(`/api/auth/token/authorization_code/${AUTH_APP_ID}`, {
          grant_type: "refresh_token",
          audience: Cypress.env("AUTH_SERVER_URL"),
          client_app_id: AUTH_APP_ID,
        }).then((r) => expect(r.status, "wrong grant_type").to.eq(400));
        postToken(`/api/auth/token/authorization_code/${AUTH_APP_ID}`, {
          nope: true,
        }).then((r) => expect(r.status, "malformed body").to.eq(400));
        postToken("/api/auth/token/authorization_code/bad%20id", valid).then((r) =>
          expect(r.status, "malformed app id").to.eq(400),
        );
        postToken(`/api/auth/token/authorization_code/${AUTH_APP_ID}`, valid, {}).then(
          (r) => expect(r.status, "web app without Origin").to.eq(403),
        );
      });
    });
  });

  describe("POST /api/auth/token/refresh_token/:client_app_id", () => {
    it("rotates from the cookie and rejects requests without a refresh token or with a mismatched body", () => {
      const refreshBody = {
        grant_type: "refresh_token",
        audience: Cypress.env("AUTH_SERVER_URL"),
        client_app_id: AUTH_APP_ID,
      };
      postToken(`/api/auth/token/refresh_token/${AUTH_APP_ID}`, refreshBody).then(
        (r) => expect(r.status, "no cookie, no bearer").to.eq(401),
      );
      postToken(`/api/auth/token/refresh_token/${AUTH_APP_ID}`, {
        ...refreshBody,
        grant_type: "authorization_code",
      }).then((r) => expect(r.status, "wrong grant_type").to.eq(400));
      postToken(`/api/auth/token/refresh_token/${AUTH_APP_ID}`, {
        ...refreshBody,
        client_app_id: "some-other-app",
      }).then((r) => expect(r.status, "client_app_id mismatch").to.eq(400));
      postToken(`/api/auth/token/refresh_token/${AUTH_APP_ID}`, refreshBody, {}).then(
        (r) => expect(r.status, "web app without Origin").to.eq(403),
      );

      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request(credentials).then(
          (ok: boolean) => expect(ok).to.be.true,
        );
        cy.reset_rate_limit();
        postToken(`/api/auth/token/refresh_token/${AUTH_APP_ID}`, refreshBody).then(
          (response) => {
            expect(response.status).to.eq(200);
            expect(response.body.success).to.eq(true);
            expect(response.body.tokens?.access).to.be.a("string");
            expect(response.body.tokens?.refresh).to.eq("AS_HTTP_ONLY_COOKIE");
          },
        );
      });
    });
  });
});
