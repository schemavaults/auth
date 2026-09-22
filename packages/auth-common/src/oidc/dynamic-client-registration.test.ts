import { describe, expect, test } from "bun:test";
import { APP_NAME_MAX_LENGTH } from "@schemavaults/app-definitions";
import {
  classifyDynamicClientRedirectUri,
  deriveDynamicClientNameFromRedirectUri,
  DYNAMIC_CLIENT_MAX_REDIRECT_URIS,
  dynamicClientRegistrationResponseSchema,
  parseDynamicClientRegistrationRequest,
  type ParseDynamicClientRegistrationRequestOptions,
} from "./dynamic-client-registration";

const PERMISSIVE: ParseDynamicClientRegistrationRequestOptions = {
  allow_localhost_redirect_uris: true,
  allow_custom_scheme_redirect_uris: true,
};

const STRICT: ParseDynamicClientRegistrationRequestOptions = {
  allow_localhost_redirect_uris: false,
  allow_custom_scheme_redirect_uris: false,
};

const HTTPS_URI = "https://client.example.com/oauth/callback";

function expectError(
  result: ReturnType<typeof parseDynamicClientRegistrationRequest>,
  code: "invalid_redirect_uri" | "invalid_client_metadata",
): string {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.error.error).toBe(code);
  expect(result.error.error_description).toBeString();
  return result.error.error_description;
}

describe("classifyDynamicClientRedirectUri", () => {
  test("classifies each scheme / host class", () => {
    expect(classifyDynamicClientRedirectUri(HTTPS_URI)).toBe("https");
    expect(classifyDynamicClientRedirectUri("http://127.0.0.1:8080/cb")).toBe("http-loopback");
    expect(classifyDynamicClientRedirectUri("http://[::1]/cb")).toBe("http-loopback");
    expect(classifyDynamicClientRedirectUri("http://localhost:3000/cb")).toBe("http-localhost");
    expect(classifyDynamicClientRedirectUri("http://client.example.com/cb")).toBe("http-other");
    expect(classifyDynamicClientRedirectUri("com.example.app:/oauth2redirect")).toBe("custom-scheme");
    expect(classifyDynamicClientRedirectUri("vscode://ms-vscode.copilot/auth")).toBe("custom-scheme");
    expect(classifyDynamicClientRedirectUri("javascript:alert(1)")).toBe("forbidden-scheme");
    expect(classifyDynamicClientRedirectUri("data:text/html,hi")).toBe("forbidden-scheme");
  });

  test("rejects fragments, relative and malformed values", () => {
    expect(classifyDynamicClientRedirectUri(`${HTTPS_URI}#frag`)).toBe("invalid");
    expect(classifyDynamicClientRedirectUri("/relative/path")).toBe("invalid");
    expect(classifyDynamicClientRedirectUri("not a url")).toBe("invalid");
    expect(classifyDynamicClientRedirectUri("")).toBe("invalid");
    expect(classifyDynamicClientRedirectUri(42)).toBe("invalid");
    expect(classifyDynamicClientRedirectUri(`https://x.example/${"a".repeat(2100)}`)).toBe("invalid");
  });
});

describe("deriveDynamicClientNameFromRedirectUri", () => {
  test("uses the host, falling back to the scheme", () => {
    expect(deriveDynamicClientNameFromRedirectUri(HTTPS_URI)).toBe("client.example.com");
    expect(deriveDynamicClientNameFromRedirectUri("http://127.0.0.1:8080/cb")).toBe("127.0.0.1:8080");
    expect(deriveDynamicClientNameFromRedirectUri("com.example.app:/cb")).toBe("com.example.app");
    expect(deriveDynamicClientNameFromRedirectUri("garbage")).toBe("Dynamically registered client");
  });
});

describe("parseDynamicClientRegistrationRequest", () => {
  test("applies RFC 7591 defaults to a minimal request", () => {
    const result = parseDynamicClientRegistrationRequest(
      { redirect_uris: [HTTPS_URI] },
      STRICT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.metadata).toEqual({
      redirect_uris: [HTTPS_URI],
      client_name: "client.example.com",
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      client_uri: null,
      logo_uri: null,
      tos_uri: null,
      policy_uri: null,
      contacts: null,
      scope: null,
      software_id: null,
      software_version: null,
    });
  });

  test("accepts a typical MCP client registration", () => {
    const result = parseDynamicClientRegistrationRequest(
      {
        client_name: "  Example MCP Client  ",
        redirect_uris: ["http://127.0.0.1:33418/callback", "http://127.0.0.1:33418/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: "mcp:tools mcp:resources",
        client_uri: "https://client.example.com",
        contacts: ["ops@example.com"],
        software_id: "example-mcp-client",
        software_version: "1.2.3",
        application_type: "native", // OIDC DCR member: ignored
        totally_unknown: { nested: true },
      },
      STRICT,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.metadata.client_name).toBe("Example MCP Client");
    // duplicates collapse
    expect(result.metadata.redirect_uris).toEqual(["http://127.0.0.1:33418/callback"]);
    expect(result.metadata.token_endpoint_auth_method).toBe("none");
    expect(result.metadata.grant_types).toEqual(["authorization_code", "refresh_token"]);
    expect(result.metadata.scope).toBe("mcp:tools mcp:resources");
    expect(result.metadata.client_uri).toBe("https://client.example.com");
    expect(result.metadata.contacts).toEqual(["ops@example.com"]);
    expect(result.metadata.software_id).toBe("example-mcp-client");
    expect(result.metadata.software_version).toBe("1.2.3");
    expect("application_type" in result.metadata).toBe(false);
  });

  describe("redirect_uris", () => {
    test("is required", () => {
      expectError(parseDynamicClientRegistrationRequest({}, PERMISSIVE), "invalid_redirect_uri");
      expectError(parseDynamicClientRegistrationRequest({ redirect_uris: [] }, PERMISSIVE), "invalid_redirect_uri");
      expectError(
        parseDynamicClientRegistrationRequest({ redirect_uris: "https://x.example/cb" }, PERMISSIVE),
        "invalid_client_metadata",
      );
    });

    test("rejects plain-http, forbidden-scheme, fragment and malformed URIs", () => {
      for (const bad of [
        "http://client.example.com/cb",
        "javascript:alert(1)",
        `${HTTPS_URI}#fragment`,
        "not a url",
      ]) {
        expectError(
          parseDynamicClientRegistrationRequest({ redirect_uris: [HTTPS_URI, bad] }, PERMISSIVE),
          "invalid_redirect_uri",
        );
      }
    });

    test("localhost and custom schemes follow the deployment policy", () => {
      const localhost = { redirect_uris: ["http://localhost:3000/cb"] };
      const custom = { redirect_uris: ["com.example.app:/cb"] };
      expect(parseDynamicClientRegistrationRequest(localhost, PERMISSIVE).ok).toBe(true);
      expect(parseDynamicClientRegistrationRequest(custom, PERMISSIVE).ok).toBe(true);
      expect(
        expectError(parseDynamicClientRegistrationRequest(localhost, STRICT), "invalid_redirect_uri"),
      ).toContain("localhost");
      expect(
        expectError(parseDynamicClientRegistrationRequest(custom, STRICT), "invalid_redirect_uri"),
      ).toContain("private-use scheme");
      // loopback IP literals are always fine
      expect(
        parseDynamicClientRegistrationRequest({ redirect_uris: ["http://127.0.0.1/cb"] }, STRICT).ok,
      ).toBe(true);
    });

    test("is capped", () => {
      const many = Array.from(
        { length: DYNAMIC_CLIENT_MAX_REDIRECT_URIS + 1 },
        (_, i) => `https://client.example.com/cb/${i}`,
      );
      expectError(
        parseDynamicClientRegistrationRequest({ redirect_uris: many }, PERMISSIVE),
        "invalid_redirect_uri",
      );
    });
  });

  describe("client_name", () => {
    test("is trimmed and bounded, never truncated", () => {
      expect(
        expectError(
          parseDynamicClientRegistrationRequest(
            { redirect_uris: [HTTPS_URI], client_name: "x".repeat(APP_NAME_MAX_LENGTH + 1) },
            PERMISSIVE,
          ),
          "invalid_client_metadata",
        ),
      ).toContain(String(APP_NAME_MAX_LENGTH));
      const max = parseDynamicClientRegistrationRequest(
        { redirect_uris: [HTTPS_URI], client_name: ` ${"x".repeat(APP_NAME_MAX_LENGTH)} ` },
        PERMISSIVE,
      );
      expect(max.ok).toBe(true);
      expectError(
        parseDynamicClientRegistrationRequest({ redirect_uris: [HTTPS_URI], client_name: "   " }, PERMISSIVE),
        "invalid_client_metadata",
      );
      expectError(
        parseDynamicClientRegistrationRequest({ redirect_uris: [HTTPS_URI], client_name: 7 }, PERMISSIVE),
        "invalid_client_metadata",
      );
    });
  });

  describe("unsupported values", () => {
    test("token_endpoint_auth_method outside the supported set", () => {
      for (const method of ["private_key_jwt", "client_secret_jwt", "tls_client_auth", ""]) {
        expectError(
          parseDynamicClientRegistrationRequest(
            { redirect_uris: [HTTPS_URI], token_endpoint_auth_method: method },
            PERMISSIVE,
          ),
          "invalid_client_metadata",
        );
      }
    });

    test("grant_types / response_types outside the supported set", () => {
      expectError(
        parseDynamicClientRegistrationRequest(
          { redirect_uris: [HTTPS_URI], grant_types: ["implicit"] },
          PERMISSIVE,
        ),
        "invalid_client_metadata",
      );
      expectError(
        parseDynamicClientRegistrationRequest(
          { redirect_uris: [HTTPS_URI], grant_types: ["client_credentials"] },
          PERMISSIVE,
        ),
        "invalid_client_metadata",
      );
      expectError(
        parseDynamicClientRegistrationRequest(
          { redirect_uris: [HTTPS_URI], grant_types: ["refresh_token"] },
          PERMISSIVE,
        ),
        "invalid_client_metadata",
      );
      expectError(
        parseDynamicClientRegistrationRequest(
          { redirect_uris: [HTTPS_URI], response_types: ["token"] },
          PERMISSIVE,
        ),
        "invalid_client_metadata",
      );
      expectError(
        parseDynamicClientRegistrationRequest(
          { redirect_uris: [HTTPS_URI], grant_types: [] },
          PERMISSIVE,
        ),
        "invalid_client_metadata",
      );
    });

    test("jwks, jwks_uri and software_statement are refused", () => {
      for (const field of ["jwks", "jwks_uri", "software_statement"]) {
        expect(
          expectError(
            parseDynamicClientRegistrationRequest(
              { redirect_uris: [HTTPS_URI], [field]: "anything" },
              PERMISSIVE,
            ),
            "invalid_client_metadata",
          ),
        ).toContain(field);
      }
    });

    test("metadata URIs must be http(s) and bounded; scope must be well-formed", () => {
      expectError(
        parseDynamicClientRegistrationRequest(
          { redirect_uris: [HTTPS_URI], logo_uri: "javascript:alert(1)" },
          PERMISSIVE,
        ),
        "invalid_client_metadata",
      );
      expectError(
        parseDynamicClientRegistrationRequest(
          { redirect_uris: [HTTPS_URI], client_uri: "not a url" },
          PERMISSIVE,
        ),
        "invalid_client_metadata",
      );
      expectError(
        parseDynamicClientRegistrationRequest(
          { redirect_uris: [HTTPS_URI], scope: "openid\temail" },
          PERMISSIVE,
        ),
        "invalid_client_metadata",
      );
      expectError(
        parseDynamicClientRegistrationRequest(
          { redirect_uris: [HTTPS_URI], contacts: [""] },
          PERMISSIVE,
        ),
        "invalid_client_metadata",
      );
      const empty_scope = parseDynamicClientRegistrationRequest(
        { redirect_uris: [HTTPS_URI], scope: "" },
        PERMISSIVE,
      );
      expect(empty_scope.ok && empty_scope.metadata.scope).toBe(null);
    });
  });

  test("non-object bodies are invalid_client_metadata", () => {
    expectError(parseDynamicClientRegistrationRequest(null, PERMISSIVE), "invalid_client_metadata");
    expectError(parseDynamicClientRegistrationRequest([], PERMISSIVE), "invalid_client_metadata");
    expectError(parseDynamicClientRegistrationRequest("{}", PERMISSIVE), "invalid_client_metadata");
  });
});

describe("dynamicClientRegistrationResponseSchema", () => {
  test("accepts a public-client response without a secret and a confidential one with", () => {
    const base = {
      client_id: "dcr-abc",
      client_id_issued_at: 1700000000,
      redirect_uris: [HTTPS_URI],
      client_name: "x",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    };
    expect(dynamicClientRegistrationResponseSchema.safeParse(base).success).toBe(true);
    expect(
      dynamicClientRegistrationResponseSchema.safeParse({
        ...base,
        token_endpoint_auth_method: "client_secret_basic",
        client_secret: "s3cret",
        client_secret_expires_at: 0,
      }).success,
    ).toBe(true);
    expect(
      dynamicClientRegistrationResponseSchema.safeParse({ ...base, client_id: "" }).success,
    ).toBe(false);
  });
});
