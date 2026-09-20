// Direct contract coverage of the two public OIDC documents. The discovery
// document was only checked for its RFC 8414 REQUIRED fields (via the
// well-known rewrites) and the JWKS was only consumed indirectly by
// openid-client:
//   GET /api/oidc/openid-configuration -> every advertised capability the
//       auth server's clients depend on, plus caching/CORS headers
//   GET /api/oidc/jwks -> RS256 signing keys only, no private members,
//       caching/CORS headers

interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  introspection_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  response_modes_supported: string[];
  grant_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  introspection_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
  claims_supported: string[];
  authorization_response_iss_parameter_supported: boolean;
  request_parameter_supported: boolean;
  request_uri_parameter_supported: boolean;
}

interface JsonWebKey {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  d?: string;
  p?: string;
  q?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

describe("GET /api/oidc/openid-configuration", () => {
  it("advertises the full provider capability set with public caching", () => {
    cy.request<DiscoveryDocument>({
      method: "GET",
      url: "/api/oidc/openid-configuration",
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.headers["cache-control"]).to.eq("public, max-age=3600");
      expect(response.headers["access-control-allow-origin"]).to.eq("*");

      const doc = response.body;
      const issuer = doc.issuer;
      expect(issuer).to.eq(new URL(Cypress.env("AUTH_SERVER_URL")).origin);
      expect(doc.userinfo_endpoint).to.eq(`${issuer}/api/oidc/userinfo`);
      expect(doc.introspection_endpoint).to.eq(`${issuer}/api/oidc/introspect`);
      expect(doc.grant_types_supported).to.deep.equal([
        "authorization_code",
        "refresh_token",
        "client_credentials",
      ]);
      expect(doc.response_modes_supported).to.deep.equal(["query"]);
      expect(doc.subject_types_supported).to.deep.equal(["public"]);
      expect(doc.id_token_signing_alg_values_supported).to.deep.equal(["RS256"]);
      expect(doc.scopes_supported).to.include.members(["openid", "email", "profile"]);
      expect(doc.claims_supported).to.include.members([
        "sub",
        "iss",
        "aud",
        "exp",
        "iat",
        "email",
        "email_verified",
      ]);
      expect(doc.token_endpoint_auth_methods_supported).to.include.members([
        "client_secret_basic",
        "client_secret_post",
      ]);
      expect(doc.introspection_endpoint_auth_methods_supported).to.include.members([
        "client_secret_basic",
        "client_secret_post",
      ]);
      expect(doc.authorization_response_iss_parameter_supported).to.eq(true);
      // JAR is refused by the authorize endpoint, so both must be false.
      expect(doc.request_parameter_supported).to.eq(false);
      expect(doc.request_uri_parameter_supported).to.eq(false);
    });
  });

  it("serves the same document as the well-known path", () => {
    cy.request<DiscoveryDocument>({
      method: "GET",
      url: "/api/oidc/openid-configuration",
    }).then((direct) => {
      cy.request<DiscoveryDocument>({
        method: "GET",
        url: "/.well-known/openid-configuration",
      }).then((wellKnown) => {
        expect(wellKnown.body).to.deep.equal(direct.body);
      });
    });
  });
});

describe("GET /api/oidc/jwks", () => {
  it("publishes RS256 signing keys without any private key material", () => {
    cy.request<{ keys: JsonWebKey[] }>({
      method: "GET",
      url: "/api/oidc/jwks",
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.headers["cache-control"]).to.eq("public, max-age=300");
      expect(response.headers["access-control-allow-origin"]).to.eq("*");
      const keys = response.body.keys;
      expect(keys).to.be.an("array").and.not.be.empty;
      for (const key of keys) {
        expect(key.kty).to.eq("RSA");
        expect(key.alg).to.eq("RS256");
        expect(key.use).to.eq("sig");
        expect(key.kid).to.be.a("string").and.not.be.empty;
        expect(key.n).to.be.a("string").and.not.be.empty;
        expect(key.e).to.be.a("string").and.not.be.empty;
        expect(key).to.not.have.any.keys("d", "p", "q", "dp", "dq", "qi");
      }
    });
  });
});
