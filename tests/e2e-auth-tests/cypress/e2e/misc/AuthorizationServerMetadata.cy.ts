/**
 * The auth server publishes one metadata document at two spec-fixed
 * well-known paths, both rewritten in next.config.ts to the same route
 * handler:
 *   - /.well-known/openid-configuration      (OIDC Discovery 1.0 §4)
 *   - /.well-known/oauth-authorization-server (RFC 8414 §3, used by
 *     plain OAuth 2.0 clients such as MCP clients)
 *
 * OpenID Provider Metadata is a superset of RFC 8414 metadata, so the
 * two responses must be byte-for-byte the same document.
 */

const OIDC_DISCOVERY_ENDPOINT = "/.well-known/openid-configuration";
const OAUTH_AUTHORIZATION_SERVER_METADATA_ENDPOINT =
  "/.well-known/oauth-authorization-server";

interface AuthorizationServerMetadata {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  jwks_uri?: string;
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

function expectAuthorizationServerMetadata(
  response: Cypress.Response<AuthorizationServerMetadata>,
): void {
  expect(response.status, "status").to.equal(200);
  expect(response.headers["content-type"], "content-type").to.include(
    "application/json",
  );
  // RFC 8414 §2 REQUIRED fields.
  expect(response.body.issuer, "issuer").to.be.a("string").and.not.be.empty;
  expect(response.body.authorization_endpoint, "authorization_endpoint")
    .to.be.a("string")
    .and.equal(`${response.body.issuer}/api/oidc/authorize`);
  expect(response.body.token_endpoint, "token_endpoint")
    .to.be.a("string")
    .and.equal(`${response.body.issuer}/api/oidc/token`);
  expect(response.body.jwks_uri, "jwks_uri")
    .to.be.a("string")
    .and.equal(`${response.body.issuer}/api/oidc/jwks`);
  expect(
    response.body.response_types_supported,
    "response_types_supported",
  ).to.deep.equal(["code"]);
  expect(
    response.body.code_challenge_methods_supported,
    "code_challenge_methods_supported",
  ).to.include("S256");
}

describe("Authorization server metadata well-known endpoints", () => {
  it("serves OpenID Provider Metadata at /.well-known/openid-configuration", () => {
    cy.request<AuthorizationServerMetadata>({
      method: "GET",
      url: OIDC_DISCOVERY_ENDPOINT,
    }).then(expectAuthorizationServerMetadata);
  });

  it("serves RFC 8414 metadata at /.well-known/oauth-authorization-server", () => {
    cy.request<AuthorizationServerMetadata>({
      method: "GET",
      url: OAUTH_AUTHORIZATION_SERVER_METADATA_ENDPOINT,
    }).then(expectAuthorizationServerMetadata);
  });

  it("serves the same document at both well-known paths", () => {
    cy.request<AuthorizationServerMetadata>({
      method: "GET",
      url: OIDC_DISCOVERY_ENDPOINT,
    }).then((oidcResponse) => {
      cy.request<AuthorizationServerMetadata>({
        method: "GET",
        url: OAUTH_AUTHORIZATION_SERVER_METADATA_ENDPOINT,
      }).then((oauthResponse) => {
        expect(oauthResponse.body, "metadata document").to.deep.equal(
          oidcResponse.body,
        );
      });
    });
  });
});
