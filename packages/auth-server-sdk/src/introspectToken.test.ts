import { beforeAll, describe, expect, test } from "bun:test";
import {
  generateJwtSigningKeyPair,
  importPKCS8,
  importSPKI,
  jwtVerify,
  sign_verify_alg,
} from "@schemavaults/jwt";
import { OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE } from "@schemavaults/auth-common";
import { introspectToken } from "./introspectToken";

const AUTH_SERVER_URL = "https://auth.example.com" as const;
const API_SERVER_ID = "4f7c2f4e-9d6a-4a1b-8f3e-2c5d6e7f8a9b" as const;
const UID = "11111111-1111-4111-8111-111111111111" as const;

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
  init: FetchInit;
}

function stubFetch(
  status: number,
  body: unknown,
): { fetch: typeof fetch; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const stub = (async (input: string | URL | Request, init?: FetchInit) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetch: stub, requests };
}

describe("introspectToken", () => {
  test("POSTs the token with a private_key_jwt client assertion", async () => {
    const { fetch, requests } = stubFetch(200, { active: false });
    await introspectToken({
      auth_server_url: AUTH_SERVER_URL,
      api_server_id: API_SERVER_ID,
      jwks_access_private_key: private_key,
      token: "the-access-token",
      fetch,
    });

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request!.url).toBe(`${AUTH_SERVER_URL}/api/oidc/introspect`);
    expect(request!.init?.method).toBe("POST");
    expect(new Headers(request!.init?.headers).get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );

    const form = new URLSearchParams(String(request!.init?.body));
    expect(form.get("token")).toBe("the-access-token");
    expect(form.get("client_id")).toBe(API_SERVER_ID);
    expect(form.get("client_assertion_type")).toBe(
      OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE,
    );

    // The assertion is a JWKS access proof token for this API server.
    const { payload } = await jwtVerify(
      form.get("client_assertion")!,
      public_key,
      { issuer: API_SERVER_ID, audience: AUTH_SERVER_URL, subject: API_SERVER_ID },
    );
    expect(typeof payload.jti).toBe("string");
  });

  test("mints a fresh single-use assertion for every call", async () => {
    const { fetch, requests } = stubFetch(200, { active: false });
    const options = {
      auth_server_url: AUTH_SERVER_URL,
      api_server_id: API_SERVER_ID,
      jwks_access_private_key: private_key,
      token: "t",
      fetch,
    };
    await introspectToken(options);
    await introspectToken(options);
    const assertions = requests.map((r) =>
      new URLSearchParams(String(r.init?.body)).get("client_assertion"),
    );
    expect(assertions[0]).not.toBe(assertions[1]);
  });

  test("returns an inactive verdict as exactly { active: false }", async () => {
    const { fetch } = stubFetch(200, { active: false });
    expect(
      await introspectToken({
        auth_server_url: AUTH_SERVER_URL,
        api_server_id: API_SERVER_ID,
        jwks_access_private_key: private_key,
        token: "t",
        fetch,
      }),
    ).toEqual({ active: false });
  });

  test("returns the metadata of an active token", async () => {
    const active = {
      active: true,
      scope: "openid email",
      client_id: "22222222-2222-4222-8222-222222222222",
      username: "user@example.com",
      token_type: "Bearer",
      exp: 1_700_000_900,
      iat: 1_700_000_000,
      sub: `schemavaults-auth|${UID}`,
      uid: UID,
      aud: API_SERVER_ID,
      iss: AUTH_SERVER_URL,
      jti: "33333333-3333-4333-8333-333333333333",
    };
    const { fetch } = stubFetch(200, active);
    expect(
      await introspectToken({
        auth_server_url: AUTH_SERVER_URL,
        api_server_id: API_SERVER_ID,
        jwks_access_private_key: private_key,
        token: "t",
        fetch,
      }),
    ).toEqual(active as never);
  });

  test("throws when the auth server refuses the client", async () => {
    const { fetch } = stubFetch(401, {
      error: "invalid_client",
      error_description: "Invalid client assertion.",
    });
    await expect(
      introspectToken({
        auth_server_url: AUTH_SERVER_URL,
        api_server_id: API_SERVER_ID,
        jwks_access_private_key: private_key,
        token: "t",
        fetch,
      }),
    ).rejects.toThrow("status: 401: invalid_client");
  });

  test("throws on an unexpected response body", async () => {
    const { fetch } = stubFetch(200, { active: "yes" });
    await expect(
      introspectToken({
        auth_server_url: AUTH_SERVER_URL,
        api_server_id: API_SERVER_ID,
        jwks_access_private_key: private_key,
        token: "t",
        fetch,
      }),
    ).rejects.toThrow("unexpected token introspection response");
  });

  test("rejects an invalid API server id or empty token before calling out", async () => {
    const { fetch, requests } = stubFetch(200, { active: false });
    await expect(
      introspectToken({
        auth_server_url: AUTH_SERVER_URL,
        api_server_id: "Not An Id!",
        jwks_access_private_key: private_key,
        token: "t",
        fetch,
      }),
    ).rejects.toThrow(TypeError);
    await expect(
      introspectToken({
        auth_server_url: AUTH_SERVER_URL,
        api_server_id: API_SERVER_ID,
        jwks_access_private_key: private_key,
        token: "",
        fetch,
      }),
    ).rejects.toThrow(TypeError);
    expect(requests).toHaveLength(0);
  });
});
