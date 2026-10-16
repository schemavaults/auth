import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SigningKeyPairFactory } from "@schemavaults/jwt";
import { JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME } from "@/env/loadJwksAccessPrivateKey";
import { JwtKeyManagerMisconfigurationError } from "@/JwtKeyManager/JwtKeyManagerMisconfigurationError";
import { RemoteJwtKeyManager } from "./RemoteJwtKeyManager";
import { isJwksDownloadRefusal } from "./loadRemoteJwks";

const AUTH_SERVER_URL = "https://auth.example.com";

/** Unique per-test API server ids keep the static JWKS cache from leaking between tests. */
let testCounter = 0;
function uniqueApiServerId(): string {
  testCounter++;
  return `remote-jwks-test-api-${testCounter}`;
}

const originalFetch = globalThis.fetch;
const originalPrivateKey = process.env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME];
let fetchCalls = 0;

function answerJwksRequestsWith(response: () => Response): void {
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    return response();
  }) as unknown as typeof fetch;
}

async function loadJwksError(api_server_id: string): Promise<unknown> {
  try {
    await new RemoteJwtKeyManager({ auth_server_url: AUTH_SERVER_URL }).loadJwks(api_server_id);
  } catch (e: unknown) {
    return e;
  }
  throw new Error("Expected loadJwks to throw");
}

beforeEach(async () => {
  const [private_key] = await new SigningKeyPairFactory().generate("base64url");
  process.env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME] = private_key;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalPrivateKey === undefined) {
    delete process.env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME];
  } else {
    process.env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME] = originalPrivateKey;
  }
});

describe("RemoteJwtKeyManager", () => {
  test("loads the JWKS the auth server sends", async () => {
    answerJwksRequestsWith(() => Response.json({ keys: [] }));
    const jwks = await new RemoteJwtKeyManager({ auth_server_url: AUTH_SERVER_URL }).loadJwks(
      uniqueApiServerId(),
    );
    expect(jwks).toEqual({ keys: [] });
    expect(fetchCalls).toBe(1);
  });

  test("reports a refused JWKS download as a misconfiguration, with the status and the auth server's answer", async () => {
    for (const status of [400, 401, 403, 404]) {
      answerJwksRequestsWith(
        () => new Response(JSON.stringify({ error: "assertion not accepted" }), { status }),
      );
      const api_server_id = uniqueApiServerId();
      const e = await loadJwksError(api_server_id);
      expect(e).toBeInstanceOf(JwtKeyManagerMisconfigurationError);
      const error = e as JwtKeyManagerMisconfigurationError;
      expect(error.reason).toBe("jwks_download_refused");
      expect(error.status).toBe(status);
      expect(error.message).toContain(api_server_id);
      expect(error.message).toContain("assertion not accepted");
      expect(error.message).toContain(JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME);
    }
  });

  test("keeps outages and rate limits apart from misconfigurations", async () => {
    for (const status of [408, 429, 500, 503]) {
      answerJwksRequestsWith(() => new Response("unavailable", { status }));
      const e = await loadJwksError(uniqueApiServerId());
      expect(e).toBeInstanceOf(Error);
      expect(e).not.toBeInstanceOf(JwtKeyManagerMisconfigurationError);
    }
  });

  test("reports an unusable JWKS access private key as a misconfiguration without calling the auth server", async () => {
    answerJwksRequestsWith(() => Response.json({ keys: [] }));
    for (const value of ["definitely not a private key!", undefined]) {
      if (value === undefined) {
        delete process.env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME];
      } else {
        process.env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME] = value;
      }
      const e = await loadJwksError(uniqueApiServerId());
      expect(e).toBeInstanceOf(JwtKeyManagerMisconfigurationError);
      const error = e as JwtKeyManagerMisconfigurationError;
      expect(error.reason).toBe("jwks_access_private_key_unusable");
      expect(error.message).toContain(JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME);
      expect(error.cause).toBeInstanceOf(Error);
    }
    expect(fetchCalls).toBe(0);
  });
});

describe("isJwksDownloadRefusal", () => {
  test("counts 4xx answers except timeouts and rate limits", () => {
    expect([400, 401, 403, 404, 410].every(isJwksDownloadRefusal)).toBe(true);
    expect([200, 302, 408, 429, 500, 502, 503].some(isJwksDownloadRefusal)).toBe(false);
  });
});
