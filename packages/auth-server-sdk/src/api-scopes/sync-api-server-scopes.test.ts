import { beforeAll, describe, expect, test } from "bun:test";
import {
  generateJwtSigningKeyPair,
  importPKCS8,
  importSPKI,
  jwtVerify,
  sign_verify_alg,
} from "@schemavaults/jwt";
import {
  ApiScopeSyncFailedError,
  InvalidApiScopeManifestError,
  parseApiScopeManifestScopes,
  syncApiServerScopes,
} from "./index";

const AUTH_SERVER_URL = "https://auth.example.com" as const;
const API_SERVER_ID = "notes-api" as const;

let private_key: CryptoKey;
let public_key: CryptoKey;

beforeAll(async () => {
  const [private_pem, public_pem] = await generateJwtSigningKeyPair();
  private_key = await importPKCS8(private_pem, sign_verify_alg);
  public_key = await importSPKI(public_pem, sign_verify_alg);
});

type FetchInit = Parameters<typeof fetch>[1];

interface CapturedRequest {
  url: string;
  method: string | undefined;
  headers: Headers;
  body: unknown;
}

function stubFetch(status: number, body: unknown): { fetch: typeof fetch; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const stub = (async (input: string | URL | Request, init?: FetchInit) => {
    requests.push({
      url: String(input),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { fetch: stub, requests };
}

function syncResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    success: true,
    data: {
      api_server_id: API_SERVER_ID,
      dry_run: false,
      created: [{ scope: "notes:read", description: "Read your notes.", allow_dynamic_clients: true }],
      updated: [],
      unchanged: [],
      not_in_manifest: [],
      ...overrides,
    },
  };
}

function options(fetchImpl: typeof fetch) {
  return {
    api_server_id: API_SERVER_ID,
    auth_server_url: AUTH_SERVER_URL,
    jwks_access_private_key: private_key,
    fetch: fetchImpl,
  } as const;
}

describe("syncApiServerScopes", () => {
  test("PUTs the whole list with a fresh assertion for the API server", async () => {
    const { fetch, requests } = stubFetch(200, syncResult());
    const result = await syncApiServerScopes({
      ...options(fetch),
      scopes: [
        { scope: "notes:read", description: "  Read your notes.  " },
        { scope: "notes:write", description: "Write your notes.", allow_dynamic_clients: false },
      ],
    });
    expect(result.created).toHaveLength(1);

    expect(requests).toHaveLength(1);
    const request = requests[0] as CapturedRequest;
    expect(request.method).toBe("PUT");
    expect(request.url).toBe(`${AUTH_SERVER_URL}/api/resource-server/apis/${API_SERVER_ID}/scopes`);
    expect(request.headers.get("content-type")).toBe("application/json");
    // Descriptions are sent trimmed, as the auth server stores them.
    expect(request.body).toEqual({
      scopes: [
        { scope: "notes:read", description: "Read your notes." },
        { scope: "notes:write", description: "Write your notes.", allow_dynamic_clients: false },
      ],
    });

    const authorization = request.headers.get("authorization") ?? "";
    expect(authorization.startsWith("Bearer ")).toBe(true);
    const { payload } = await jwtVerify(authorization.slice("Bearer ".length), public_key, {
      audience: AUTH_SERVER_URL,
      issuer: API_SERVER_ID,
    });
    expect(payload.sub).toBe(API_SERVER_ID);
    expect(typeof payload.jti).toBe("string");
  });

  test("accepts the { scope: description } shorthand and asks for a dry run", async () => {
    const { fetch, requests } = stubFetch(200, syncResult({ dry_run: true }));
    const result = await syncApiServerScopes({
      ...options(fetch),
      scopes: { "notes:read": "Read your notes." },
      dry_run: true,
    });
    expect(result.dry_run).toBe(true);
    expect(new URL(requests[0]?.url ?? "").searchParams.get("dry_run")).toBe("true");
    expect(requests[0]?.body).toEqual({ scopes: [{ scope: "notes:read", description: "Read your notes." }] });
  });

  test("refuses an invalid manifest locally, without calling the auth server", async () => {
    const { fetch, requests } = stubFetch(200, syncResult());
    for (const scopes of [
      [{ scope: "openid", description: "Reserved." }],
      [{ scope: "notes:read", description: "   " }],
      [
        { scope: "notes:read", description: "Read." },
        { scope: "notes:read", description: "Read again." },
      ],
    ]) {
      const error = await syncApiServerScopes({ ...options(fetch), scopes }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InvalidApiScopeManifestError);
      expect((error as InvalidApiScopeManifestError).issues.length).toBeGreaterThan(0);
    }
    expect(requests).toHaveLength(0);
    expect(() => parseApiScopeManifestScopes({ "bad scope": "Spaces." })).toThrow(InvalidApiScopeManifestError);
  });

  test("throws ApiScopeSyncFailedError with the status and error code of a refusal", async () => {
    const cases: [number, unknown, string | null][] = [
      [401, { success: false, error: "invalid_assertion", message: "Invalid or expired JWKS access assertion" }, "invalid_assertion"],
      [409, { success: false, error: "too_many_scopes", message: "An API server cannot define more than 100 scopes" }, "too_many_scopes"],
      [400, { success: false, error: "hardcoded_api_server", message: "Hardcoded API servers cannot define API scopes" }, "hardcoded_api_server"],
      // The older resource-server envelope: the reason text in `error`.
      [400, { success: false, error: "Bad Request" }, null],
      [500, "not json", null],
    ];
    for (const [status, body, code] of cases) {
      const { fetch } = stubFetch(status, body);
      const error = await syncApiServerScopes({ ...options(fetch), scopes: [] }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiScopeSyncFailedError);
      expect((error as ApiScopeSyncFailedError).status).toBe(status);
      expect((error as ApiScopeSyncFailedError).code).toBe(code);
    }
  });

  test("carries the issues of a validation_error refusal", async () => {
    const { fetch } = stubFetch(400, {
      success: false,
      error: "validation_error",
      message: "Invalid request body",
      issues: [{ location: "body", path: "scopes.0.scope", message: "Invalid", code: "custom" }],
    });
    const error = (await syncApiServerScopes({ ...options(fetch), scopes: [] }).catch((e: unknown) => e)) as ApiScopeSyncFailedError;
    expect(error.code).toBe("validation_error");
    expect(error.issues).toEqual([{ path: "scopes.0.scope", message: "Invalid" }]);
  });

  test("hints that a 404 without a known error code means an older auth server", async () => {
    const { fetch } = stubFetch(404, { success: false, message: "Not found" });
    const error = (await syncApiServerScopes({ ...options(fetch), scopes: [] }).catch((e: unknown) => e)) as ApiScopeSyncFailedError;
    expect(error.status).toBe(404);
    expect(error.message).toContain("predate scope sync");
  });

  test("refuses an unexpected success body, or one about another API server", async () => {
    for (const body of [{ success: true }, syncResult({ api_server_id: "other-api" })]) {
      const { fetch } = stubFetch(200, body);
      const error = await syncApiServerScopes({ ...options(fetch), scopes: [] }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiScopeSyncFailedError);
      expect((error as ApiScopeSyncFailedError).status).toBe(200);
    }
  });
});
