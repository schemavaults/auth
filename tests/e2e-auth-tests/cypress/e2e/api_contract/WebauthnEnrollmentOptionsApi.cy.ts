// POST /api/user/mfa/webauthn/options (begin a passkey enrollment) and
// POST /api/user/mfa/webauthn/authenticate-options (step-up) were only
// reached through the UI + virtual authenticator. Pin the API contract:
// the raw (non-enveloped) shapes the client SDK parses with the strict
// webauthnEnrollOptionsResponseSchema / webauthnAuthenticationOptionsResponseSchema.

interface EnrollOptionsResponse {
  factor_id?: string;
  options?: { challenge?: string; rp?: { id?: string; name?: string }; user?: unknown };
  success?: boolean;
  message?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

describe("WebAuthn enrollment options API", () => {
  beforeEach(() => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (ok: boolean) => expect(ok, "regular user login").to.be.true,
      );
    });
  });

  it("POST /api/user/mfa/webauthn/options returns { factor_id, options } with a challenge", () => {
    cy.request<EnrollOptionsResponse>({
      method: "POST",
      url: "/api/user/mfa/webauthn/options",
      body: {},
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.factor_id).to.be.a("string").and.not.be.empty;
      expect(response.body.options?.challenge).to.be.a("string").and.not.be.empty;
      expect(response.body.options?.rp?.id).to.be.a("string");
      expect(response.body).to.not.have.property("success");
    });
  });

  it("POST /api/user/mfa/webauthn/authenticate-options without an enrolled passkey is refused", () => {
    cy.request<EnrollOptionsResponse>({
      method: "POST",
      url: "/api/user/mfa/webauthn/authenticate-options",
      body: {},
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(409);
      expect(response.body.success).to.eq(false);
    });
  });

  it("POST /api/user/mfa/webauthn/verify-enrollment with an invalid body is a 400", () => {
    cy.request<EnrollOptionsResponse>({
      method: "POST",
      url: "/api/user/mfa/webauthn/verify-enrollment",
      body: { factor_id: "not-a-guid", attestation: {} },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400);
    });
  });
});
