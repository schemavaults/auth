// OidcTokenIntrospection.cy.ts
//
// Direct probes of the OIDC token introspection endpoint
// (auth-server/src/app/api/oidc/introspect/route.ts, RFC 7662) and its
// registration in the discovery document.
//
// Like ConfidentialClientTokenEndpoint.cy.ts, no browser flow is
// involved: the endpoint's authorization layer (confidential-client
// authentication) and its inactive-token semantics are both assertable
// with a single cy.request each. A syntactically bogus token presented
// with valid client credentials MUST come back `{ active: false }` with
// nothing else in the body (§2.2) — the same response an expired or
// revoked token gets, so a caller learns nothing it wasn't entitled to.
//
// Both apps are seeded in cypress.config.ts's before:run hook: the
// public (PKCE-only) app used by the rest of this suite, and the
// confidential one exercised here.

describe("OIDC token introspection endpoint (RFC 7662)", () => {
  const INTROSPECTION_ENDPOINT = "/api/oidc/introspect";
  const DISCOVERY_ENDPOINT = "/.well-known/openid-configuration";

  /** RFC 6749 §5.2 challenge sent with every failed-authentication 401. */
  const EXPECTED_WWW_AUTHENTICATE =
    'Basic realm="oauth2/token", charset="UTF-8"';

  const confidentialClientId: string = Cypress.env(
    "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID",
  );
  const confidentialClientSecret: string = Cypress.env(
    "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET",
  );

  // The public (no client secret) app the rest of this suite drives.
  const publicClientId = "00000000-0000-0000-0000-000000000000";

  /**
   * HTTP Basic credentials per RFC 6749 §2.3.1: client_id and
   * client_secret are form-urlencoded before being base64-encoded.
   */
  function basicHeader(client_id: string, client_secret: string): string {
    const encoded: string = btoa(
      `${encodeURIComponent(client_id)}:${encodeURIComponent(client_secret)}`,
    );
    return `Basic ${encoded}`;
  }

  interface IntrospectionProbeOptions {
    /** Form fields (token, client_id, client_secret, ...). */
    form?: Record<string, string>;
    /** Authorization header value, if any. */
    authorization?: string;
  }

  function probeIntrospectionEndpoint(
    options: IntrospectionProbeOptions,
  ): Cypress.Chainable<Cypress.Response<{
    active?: boolean;
    error?: string;
    error_description?: string;
  }>> {
    return cy.request({
      method: "POST",
      url: INTROSPECTION_ENDPOINT,
      form: true,
      failOnStatusCode: false,
      headers: options.authorization
        ? { Authorization: options.authorization }
        : {},
      body: options.form ?? {},
    });
  }

  function expectInvalidClient(
    response: Cypress.Response<{ error?: string; error_description?: string }>,
    expectedDescription: string,
  ): void {
    expect(response.status, "status").to.equal(401);
    expect(response.body.error, "error").to.equal("invalid_client");
    expect(response.body.error_description, "error_description").to.equal(
      expectedDescription,
    );
    expect(
      response.headers["www-authenticate"],
      "WWW-Authenticate header",
    ).to.equal(EXPECTED_WWW_AUTHENTICATE);
  }

  it("advertises the introspection endpoint in the discovery document", () => {
    cy.request({
      method: "GET",
      url: DISCOVERY_ENDPOINT,
    }).then(
      (
        response: Cypress.Response<{
          issuer?: string;
          introspection_endpoint?: string;
          introspection_endpoint_auth_methods_supported?: string[];
        }>,
      ) => {
        expect(response.status, "status").to.equal(200);
        expect(
          response.body.introspection_endpoint,
          "introspection_endpoint",
        ).to.equal(`${response.body.issuer}/api/oidc/introspect`);
        // "none" is deliberately absent: introspection requires a
        // confidential client (RFC 7662 §2.1).
        expect(
          response.body.introspection_endpoint_auth_methods_supported,
          "introspection_endpoint_auth_methods_supported",
        ).to.deep.equal(["client_secret_basic", "client_secret_post"]);
      },
    );
  });

  it("rejects a request that identifies no client at all", () => {
    probeIntrospectionEndpoint({ form: { token: "probe" } }).then(
      (response) => {
        expectInvalidClient(
          response,
          "Client authentication is required to introspect tokens (client_secret_basic or client_secret_post).",
        );
      },
    );
  });

  it("rejects a confidential client that presents no credentials", () => {
    probeIntrospectionEndpoint({
      form: { token: "probe", client_id: confidentialClientId },
    }).then((response) => {
      expectInvalidClient(
        response,
        "Client authentication is required for this client (client_secret_basic or client_secret_post).",
      );
    });
  });

  it("rejects a wrong client secret sent via client_secret_basic", () => {
    probeIntrospectionEndpoint({
      form: { token: "probe" },
      authorization: basicHeader(
        confidentialClientId,
        `${confidentialClientSecret}-wrong`,
      ),
    }).then((response) => {
      expectInvalidClient(response, "Invalid client credentials.");
    });
  });

  it("rejects a public (PKCE-only) client — introspection requires a confidential client", () => {
    probeIntrospectionEndpoint({
      form: { token: "probe", client_id: publicClientId },
    }).then((response) => {
      expectInvalidClient(
        response,
        "Token introspection requires a confidential client; register a client secret for this app.",
      );
    });
  });

  it("rejects a request missing the required 'token' parameter with a 400", () => {
    // RFC 7662 §2.1: `token` is REQUIRED — its absence is a protocol
    // error, never an `{ active: false }` verdict.
    probeIntrospectionEndpoint({
      authorization: basicHeader(
        confidentialClientId,
        confidentialClientSecret,
      ),
    }).then((response) => {
      expect(response.status, "status").to.equal(400);
      expect(response.body.error, "error").to.equal("invalid_request");
      expect(response.body.error_description, "error_description").to.equal(
        "Missing 'token' parameter.",
      );
    });
  });

  it("reports a garbage token as exactly { active: false } (client_secret_basic)", () => {
    probeIntrospectionEndpoint({
      form: { token: "not-a-real-token" },
      authorization: basicHeader(
        confidentialClientId,
        confidentialClientSecret,
      ),
    }).then((response) => {
      expect(response.status, "status").to.equal(200);
      // §2.2: an inactive-token response SHOULD NOT carry any member
      // beyond `active` — nothing must leak about why it is inactive.
      expect(response.body, "body").to.deep.equal({ active: false });
      expect(response.headers["cache-control"], "Cache-Control").to.contain(
        "no-store",
      );
    });
  });

  it("reports a garbage token as inactive via client_secret_post too", () => {
    probeIntrospectionEndpoint({
      form: {
        token: "not-a-real-token",
        client_id: confidentialClientId,
        client_secret: confidentialClientSecret,
      },
    }).then((response) => {
      expect(response.status, "status").to.equal(200);
      expect(response.body, "body").to.deep.equal({ active: false });
    });
  });

  it("ignores an unknown token_type_hint and still answers (RFC 7662 §2.1)", () => {
    probeIntrospectionEndpoint({
      form: {
        token: "not-a-real-token",
        token_type_hint: "saml2-bearer",
      },
      authorization: basicHeader(
        confidentialClientId,
        confidentialClientSecret,
      ),
    }).then((response) => {
      expect(response.status, "status").to.equal(200);
      expect(response.body, "body").to.deep.equal({ active: false });
    });
  });
});
