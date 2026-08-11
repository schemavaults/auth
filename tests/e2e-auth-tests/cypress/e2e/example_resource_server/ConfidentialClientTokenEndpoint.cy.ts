// ConfidentialClientTokenEndpoint.cy.ts
//
// Direct probes of the OIDC token endpoint's client-authentication
// layer (auth-server/src/lib/oauth2/authenticate-token-endpoint-client.ts)
// for a confidential client — an app with a client secret registered on
// the auth server.
//
// No browser flow is involved: client authentication is checked BEFORE
// the authorization code is looked at, so a request carrying valid
// client credentials and a garbage `code` fails with 400 invalid_grant
// (authentication passed), while a request with bad or missing
// credentials fails with 401 invalid_client (authentication failed).
// That split is what makes every case below assertable with a single
// cy.request, and it is also why the 401s are the interesting ones: the
// sign-in spec (ConfidentialClientSignIn.cy.ts) can only tell you that
// the happy path works, because openid-client raises a generic
// WWW-Authenticate challenge error before it ever parses the error body.
//
// Both apps are seeded in cypress.config.ts's before:run hook: the
// public (PKCE-only) app used by the rest of this suite, and the
// confidential one exercised here.

describe("OIDC token endpoint client authentication (RFC 6749 §2.3, §5.2)", () => {
  const TOKEN_ENDPOINT = "/api/oidc/token";
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

  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const redirectUri: string = `${new URL(exampleAppUrl).origin}/openid-client-confidential/callback`;

  // A syntactically valid PKCE code_verifier (RFC 7636 §4.1: 43-128
  // unreserved characters) so the request survives parameter validation
  // and reaches the code lookup.
  const PROBE_CODE_VERIFIER = "e".repeat(43);

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

  interface TokenProbeOptions {
    client_id: string;
    /** Extra form fields (client_secret, client_assertion, ...). */
    form?: Record<string, string>;
    /** Authorization header value, if any. */
    authorization?: string;
  }

  /**
   * Posts an authorization_code grant with a deliberately bogus `code`.
   * Whatever comes back is a verdict on client authentication alone.
   */
  function probeTokenEndpoint(
    options: TokenProbeOptions,
  ): Cypress.Chainable<Cypress.Response<{
    error?: string;
    error_description?: string;
  }>> {
    return cy.request({
      method: "POST",
      url: TOKEN_ENDPOINT,
      form: true,
      failOnStatusCode: false,
      headers: options.authorization
        ? { Authorization: options.authorization }
        : {},
      body: {
        grant_type: "authorization_code",
        client_id: options.client_id,
        code: "probe",
        redirect_uri: redirectUri,
        code_verifier: PROBE_CODE_VERIFIER,
        ...(options.form ?? {}),
      },
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

  it("rejects a confidential client that presents no credentials", () => {
    probeTokenEndpoint({ client_id: confidentialClientId }).then((response) => {
      expectInvalidClient(
        response,
        "Client authentication is required for this client (client_secret_basic or client_secret_post).",
      );
    });
  });

  it("rejects a wrong client secret sent via client_secret_basic", () => {
    probeTokenEndpoint({
      client_id: confidentialClientId,
      authorization: basicHeader(
        confidentialClientId,
        `${confidentialClientSecret}-wrong`,
      ),
    }).then((response) => {
      expectInvalidClient(response, "Invalid client credentials.");
    });
  });

  it("rejects a wrong client secret sent via client_secret_post", () => {
    probeTokenEndpoint({
      client_id: confidentialClientId,
      form: { client_secret: `${confidentialClientSecret}-wrong` },
    }).then((response) => {
      expectInvalidClient(response, "Invalid client credentials.");
    });
  });

  it("rejects Basic credentials whose client_id disagrees with the request", () => {
    probeTokenEndpoint({
      client_id: confidentialClientId,
      authorization: basicHeader(publicClientId, confidentialClientSecret),
    }).then((response) => {
      expectInvalidClient(
        response,
        "The Authorization header credentials do not match the request's client_id.",
      );
    });
  });

  it("rejects client credentials sent for a public client", () => {
    // Misconfiguration must fail loudly rather than be silently
    // ignored: the public app has no secret registered, so presenting
    // one is an error.
    probeTokenEndpoint({
      client_id: publicClientId,
      form: { client_secret: confidentialClientSecret },
    }).then((response) => {
      expectInvalidClient(
        response,
        "This client has no client secret registered; do not send client credentials.",
      );
    });
  });

  it("rejects using both client authentication methods in one request", () => {
    // RFC 6749 §2.3: clients MUST NOT use more than one authentication
    // method per request. This is a protocol error (400), not an
    // authentication failure (401), so no challenge header is expected.
    probeTokenEndpoint({
      client_id: confidentialClientId,
      authorization: basicHeader(confidentialClientId, confidentialClientSecret),
      form: { client_secret: confidentialClientSecret },
    }).then((response) => {
      expect(response.status, "status").to.equal(400);
      expect(response.body.error, "error").to.equal("invalid_request");
      expect(response.body.error_description, "error_description").to.equal(
        "Multiple client authentication methods used; present the client_secret via either the Authorization header or the request body, not both.",
      );
    });
  });

  it("rejects a malformed Basic Authorization header", () => {
    probeTokenEndpoint({
      client_id: confidentialClientId,
      // Decodes cleanly as base64 but carries no ':' separator.
      authorization: `Basic ${btoa("not-a-credentials-pair")}`,
    }).then((response) => {
      expect(response.status, "status").to.equal(400);
      expect(response.body.error, "error").to.equal("invalid_request");
      expect(response.body.error_description, "error_description").to.equal(
        "Malformed Basic Authorization header.",
      );
    });
  });

  it("ignores private_key_jwt client assertions (the method is not supported)", () => {
    // Pins down today's behavior for a JWT-based client authentication
    // method the auth server does not implement and does not advertise:
    // the assertion parameters are ignored entirely, so the request
    // reads as "no credentials presented" and gets the 401 challenge.
    // This is exactly how the production incident manifested — an RP
    // configured for private_key_jwt looked, from the server's side,
    // like an unauthenticated confidential client.
    const client_assertion: string = [
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9",
      "eyJpc3MiOiJwcm9iZSIsInN1YiI6InByb2JlIn0",
      "not-a-real-signature",
    ].join(".");

    probeTokenEndpoint({
      client_id: confidentialClientId,
      form: {
        client_assertion_type:
          "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion,
      },
    }).then((response) => {
      expectInvalidClient(
        response,
        "Client authentication is required for this client (client_secret_basic or client_secret_post).",
      );
    });
  });

  it("accepts the correct client secret via client_secret_basic (then fails on the code)", () => {
    // 400 invalid_grant instead of 401 invalid_client proves the
    // request got PAST client authentication and died on the bogus
    // authorization code — i.e. the credentials themselves were good.
    probeTokenEndpoint({
      client_id: confidentialClientId,
      authorization: basicHeader(confidentialClientId, confidentialClientSecret),
    }).then((response) => {
      expect(response.status, "status").to.equal(400);
      expect(response.body.error, "error").to.equal("invalid_grant");
      expect(response.headers["www-authenticate"], "WWW-Authenticate header").to
        .be.undefined;
    });
  });

  it("accepts the correct client secret via client_secret_post (then fails on the code)", () => {
    probeTokenEndpoint({
      client_id: confidentialClientId,
      form: { client_secret: confidentialClientSecret },
    }).then((response) => {
      expect(response.status, "status").to.equal(400);
      expect(response.body.error, "error").to.equal("invalid_grant");
      expect(response.headers["www-authenticate"], "WWW-Authenticate header").to
        .be.undefined;
    });
  });

  it("authenticates a client that identifies itself solely via the Basic header", () => {
    // RFC 6749 §2.3.1 allows client_secret_basic clients to omit
    // client_id from the body entirely.
    cy.request({
      method: "POST",
      url: TOKEN_ENDPOINT,
      form: true,
      failOnStatusCode: false,
      headers: {
        Authorization: basicHeader(
          confidentialClientId,
          confidentialClientSecret,
        ),
      },
      body: {
        grant_type: "authorization_code",
        code: "probe",
        redirect_uri: redirectUri,
        code_verifier: PROBE_CODE_VERIFIER,
      },
    }).then((response: Cypress.Response<{ error?: string }>) => {
      expect(response.status, "status").to.equal(400);
      expect(response.body.error, "error").to.equal("invalid_grant");
    });
  });

  it("advertises exactly the implemented token endpoint auth methods", () => {
    cy.request({
      method: "GET",
      url: DISCOVERY_ENDPOINT,
    }).then(
      (
        response: Cypress.Response<{
          token_endpoint_auth_methods_supported?: string[];
        }>,
      ) => {
        expect(response.status, "status").to.equal(200);
        // JWT-based methods (private_key_jwt / client_secret_jwt) are
        // deliberately absent: they are not implemented, and the probe
        // above shows what happens when an RP assumes otherwise.
        expect(
          response.body.token_endpoint_auth_methods_supported,
          "token_endpoint_auth_methods_supported",
        ).to.deep.equal(["none", "client_secret_basic", "client_secret_post"]);
      },
    );
  });
});
