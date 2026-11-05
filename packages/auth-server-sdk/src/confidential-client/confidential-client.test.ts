import { describe, expect, test } from "bun:test";
import { exchangeTokenForDelegatedToken } from "./exchange-token-for-delegated-token";
import { revokeToken } from "./revoke-token";
import { OAuthEndpointError } from "./shared";

const AUTH_SERVER_URL = "https://auth.example.com" as const;
const CLIENT_ID = "22222222-2222-4222-8222-222222222222" as const;
const CLIENT_SECRET = "s3cr3t:with/odd chars" as const;
const TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

type FetchInit = Parameters<typeof fetch>[1];

interface CapturedRequest {
  url: string;
  init: FetchInit;
}

/** A `fetch` stub that records its requests and answers each the same way. */
function stubFetch(
  status: number,
  body: unknown,
  { json = true }: { json?: boolean } = {},
): { fetch: typeof fetch; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const stub = (async (input: string | URL | Request, init?: FetchInit) => {
    requests.push({ url: String(input), init });
    return new Response(json ? JSON.stringify(body) : String(body), {
      status,
      headers: { "Content-Type": json ? "application/json" : "text/plain" },
    });
  }) as typeof fetch;
  return { fetch: stub, requests };
}

const DELEGATED_RESPONSE = {
  access_token: "the-delegated-token",
  issued_token_type: ACCESS_TOKEN_TYPE,
  token_type: "Bearer",
  expires_in: 5400,
  scope: "notes:read",
} as const;

function exchangeOptions(fetch: typeof globalThis.fetch) {
  return {
    auth_server_url: AUTH_SERVER_URL,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    subject_token: "the-users-access-token",
    fetch,
  };
}

describe("exchangeTokenForDelegatedToken", () => {
  test("POSTs an RFC 8693 token exchange authenticated with client_secret_basic", async () => {
    const { fetch, requests } = stubFetch(200, DELEGATED_RESPONSE);
    const result = await exchangeTokenForDelegatedToken(exchangeOptions(fetch));

    expect(result).toEqual(DELEGATED_RESPONSE);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request!.url).toBe(`${AUTH_SERVER_URL}/api/oidc/token`);
    expect(request!.init?.method).toBe("POST");
    const headers = new Headers(request!.init?.headers);
    expect(headers.get("Content-Type")).toBe("application/x-www-form-urlencoded");
    // RFC 6749 §2.3.1: URL-encoded id and secret, the way the auth server decodes them.
    const basic = headers.get("Authorization")!;
    expect(basic.startsWith("Basic ")).toBe(true);
    const [id, secret] = atob(basic.slice("Basic ".length)).split(":");
    expect(decodeURIComponent(id!)).toBe(CLIENT_ID);
    expect(decodeURIComponent(secret!)).toBe(CLIENT_SECRET);

    const form = new URLSearchParams(String(request!.init?.body));
    expect(Object.fromEntries(form)).toEqual({
      grant_type: TOKEN_EXCHANGE,
      subject_token: "the-users-access-token",
      subject_token_type: ACCESS_TOKEN_TYPE,
    });
    // The secret travels only in the header (one authentication method per request).
    expect(form.has("client_secret")).toBe(false);
  });

  test("narrows the scope (string or list) and passes the resource through", async () => {
    const { fetch, requests } = stubFetch(200, DELEGATED_RESPONSE);
    await exchangeTokenForDelegatedToken({
      ...exchangeOptions(fetch),
      scope: ["notes:read", " notes:list "],
      resource: "https://mcp.example.com/mcp",
    });
    await exchangeTokenForDelegatedToken({ ...exchangeOptions(fetch), scope: "notes:read  notes:list" });

    const [first, second] = requests.map(
      (request) => new URLSearchParams(String(request.init?.body)),
    );
    expect(first!.get("scope")).toBe("notes:read notes:list");
    expect(first!.get("resource")).toBe("https://mcp.example.com/mcp");
    expect(second!.get("scope")).toBe("notes:read notes:list");
    expect(second!.has("resource")).toBe(false);
  });

  test("refuses an empty scope instead of sending an ambiguous one", async () => {
    const { fetch, requests } = stubFetch(200, DELEGATED_RESPONSE);
    await expect(exchangeTokenForDelegatedToken({ ...exchangeOptions(fetch), scope: [] })).rejects.toThrow(
      TypeError,
    );
    await expect(exchangeTokenForDelegatedToken({ ...exchangeOptions(fetch), scope: " " })).rejects.toThrow(
      TypeError,
    );
    expect(requests).toHaveLength(0);
  });

  test("refuses missing inputs before calling the auth server", async () => {
    const { fetch, requests } = stubFetch(200, DELEGATED_RESPONSE);
    await expect(
      exchangeTokenForDelegatedToken({ ...exchangeOptions(fetch), subject_token: "" }),
    ).rejects.toThrow(TypeError);
    await expect(
      exchangeTokenForDelegatedToken({ ...exchangeOptions(fetch), client_secret: "" }),
    ).rejects.toThrow(TypeError);
    await expect(
      exchangeTokenForDelegatedToken({ ...exchangeOptions(fetch), resource: "" }),
    ).rejects.toThrow(TypeError);
    expect(requests).toHaveLength(0);
  });

  test("surfaces the OAuth error of a refused exchange", async () => {
    const { fetch } = stubFetch(400, {
      error: "invalid_target",
      error_description: "The API server does not accept delegated tokens; its managers can turn them on.",
    });
    const refusal = await exchangeTokenForDelegatedToken(exchangeOptions(fetch)).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(OAuthEndpointError);
    const error = refusal as OAuthEndpointError;
    expect(error.status).toBe(400);
    expect(error.error).toBe("invalid_target");
    expect(error.error_description).toContain("does not accept delegated tokens");
  });

  test("reports a refusal without a JSON body with a null error code", async () => {
    const { fetch } = stubFetch(502, "Bad Gateway", { json: false });
    const refusal = await exchangeTokenForDelegatedToken(exchangeOptions(fetch)).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(OAuthEndpointError);
    expect((refusal as OAuthEndpointError).status).toBe(502);
    expect((refusal as OAuthEndpointError).error).toBeNull();
  });

  test("rejects a success response that is not a delegated access token", async () => {
    for (const body of [
      { ...DELEGATED_RESPONSE, issued_token_type: "urn:ietf:params:oauth:token-type:refresh_token" },
      { ...DELEGATED_RESPONSE, access_token: "" },
      { access_token: "x", token_type: "Bearer", expires_in: 5400 },
    ]) {
      const { fetch } = stubFetch(200, body);
      await expect(exchangeTokenForDelegatedToken(exchangeOptions(fetch))).rejects.toThrow(
        "unexpected token exchange response",
      );
    }
  });

  test("accepts a response without scope (plain OAuth grant)", async () => {
    const without_scope: Record<string, unknown> = { ...DELEGATED_RESPONSE };
    delete without_scope.scope;
    const { fetch } = stubFetch(200, without_scope);
    const result = await exchangeTokenForDelegatedToken(exchangeOptions(fetch));
    expect(result.scope).toBeUndefined();
    expect(result.access_token).toBe("the-delegated-token");
  });
});

function revokeOptions(fetch: typeof globalThis.fetch) {
  return {
    // A trailing slash on the issuer does not double up.
    auth_server_url: `${AUTH_SERVER_URL}/`,
    client_id: CLIENT_ID,
    client_secret: "the-secret",
    token: "the-delegated-token",
    fetch,
  };
}

describe("revokeToken", () => {
  test("POSTs the token to the revocation endpoint with client_secret_basic", async () => {
    const { fetch, requests } = stubFetch(200, "", { json: false });
    await revokeToken({ ...revokeOptions(fetch), token_type_hint: "access_token" });

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request!.url).toBe(`${AUTH_SERVER_URL}/api/oidc/revoke`);
    const headers = new Headers(request!.init?.headers);
    expect(headers.get("Authorization")).toBe(
      `Basic ${btoa(`${CLIENT_ID}:the-secret`)}`,
    );
    expect(Object.fromEntries(new URLSearchParams(String(request!.init?.body)))).toEqual({
      token: "the-delegated-token",
      token_type_hint: "access_token",
    });
  });

  test("omits the hint unless given", async () => {
    const { fetch, requests } = stubFetch(200, "", { json: false });
    await revokeToken(revokeOptions(fetch));
    expect(new URLSearchParams(String(requests[0]!.init?.body)).has("token_type_hint")).toBe(false);
  });

  test("throws the OAuth error when the auth server refuses", async () => {
    const { fetch } = stubFetch(400, {
      error: "invalid_grant",
      error_description: "The token was not issued to this client.",
    });
    const refusal = await revokeToken(revokeOptions(fetch)).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(OAuthEndpointError);
    expect((refusal as OAuthEndpointError).error).toBe("invalid_grant");
    expect((refusal as OAuthEndpointError).message).toContain("revocation endpoint");
  });

  test("refuses an empty token before calling the auth server", async () => {
    const { fetch, requests } = stubFetch(200, "", { json: false });
    await expect(revokeToken({ ...revokeOptions(fetch), token: "" })).rejects.toThrow(TypeError);
    expect(requests).toHaveLength(0);
  });
});
