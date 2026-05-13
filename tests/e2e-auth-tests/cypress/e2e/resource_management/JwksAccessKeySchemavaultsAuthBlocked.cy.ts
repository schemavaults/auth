// Verifies that the JWKS access-key management endpoints under
// auth-server/src/app/api/apis/[api_server_id]/jwks-access-key/ reject ALL
// callers — including the global superuser admin — when the targeted
// api_server_id is `schemavaults-auth`.
//
// The auth server is itself the JWKS provider, so its own JWKS access key
// cannot be issued, rotated, or read through the same self-service endpoints
// used for regular consumer API servers. The block lives at the top of each
// handler:
//   - POST_generate_jwks_access_key.ts
//   - PUT_regenerate_jwks_access_key.ts
//   - GET_jwks_access_key_metadata.ts
// where `api_server_id === SCHEMAVAULTS_AUTH_SERVER.api_server_id` short-
// circuits with a 403 BEFORE the org-membership / admin-bypass authorization
// check. That ordering is the property under test: the superuser admin's
// `user.admin` bypass — which DOES grant access on every other API server
// (covered by JwksAccessKeyAuthorization.cy.ts) — must NOT apply here.
//
// If this test fails, the auth server's JWKS provider self-protection has
// regressed and the admin bypass is now reachable on `schemavaults-auth`.

describe("JWKS Access Key Management Blocked for schemavaults-auth", () => {
  // The hardcoded API server ID for the auth server itself. Defined as
  // SCHEMAVAULTS_AUTH_SERVER.api_server_id in
  // packages/app-definitions/src/hardcoded-core-schemavaults-api-servers.ts.
  const SCHEMAVAULTS_AUTH_API_SERVER_ID = "schemavaults-auth";

  beforeEach(() => {
    // Log in as the superuser admin so that the only authorization gate that
    // could still produce a 403 is the schemavaults-auth-specific block. Any
    // other 403 here would come from the org-membership check, which the
    // superuser's `user.admin` bypass already defeats.
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }
    });
  });

  it("POST /api/apis/schemavaults-auth/jwks-access-key returns 403 for the superuser admin", () => {
    cy.request({
      method: "POST",
      url: `/api/apis/${SCHEMAVAULTS_AUTH_API_SERVER_ID}/jwks-access-key`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
      expect(String(response.body.message).toLowerCase()).to.include(
        "schemavaults-auth",
      );
      // Make sure the block actually short-circuited: a successful POST
      // would carry a `key_id`/`private_key`, neither of which must ever
      // leak for the auth server itself.
      expect(response.body).to.not.have.property("key_id");
      expect(response.body).to.not.have.property("private_key");
    });
  });

  it("PUT /api/apis/schemavaults-auth/jwks-access-key returns 403 for the superuser admin", () => {
    cy.request({
      method: "PUT",
      url: `/api/apis/${SCHEMAVAULTS_AUTH_API_SERVER_ID}/jwks-access-key`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
      expect(String(response.body.message).toLowerCase()).to.include(
        "schemavaults-auth",
      );
      expect(response.body).to.not.have.property("key_id");
      expect(response.body).to.not.have.property("private_key");
    });
  });

  it("GET /api/apis/schemavaults-auth/jwks-access-key returns 403 for the superuser admin", () => {
    cy.request({
      method: "GET",
      url: `/api/apis/${SCHEMAVAULTS_AUTH_API_SERVER_ID}/jwks-access-key`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
      expect(String(response.body.message).toLowerCase()).to.include(
        "schemavaults-auth",
      );
      // The metadata response shape on success is `{ success: true,
      // key_metadata: ... }`. Asserting the absence of `key_metadata` here
      // confirms the handler short-circuited before the registry lookup
      // and did not silently expose key state for the auth server.
      expect(response.body).to.not.have.property("key_metadata");
    });
  });
});
