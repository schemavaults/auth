import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  DEFAULT_AUTH_SERVER_APP_ID,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import { generateNewJwtKeySet, JWT_Factory, SigningKeyPairFactory, type JWT_Keys } from "@schemavaults/jwt";
import {
  createOperationsApp,
  createOperationDefiner,
  requireAuth,
  schemaVaultsAccessTokenBearerScheme,
  schemaVaultsAccessTokenCookieScheme,
  z,
} from "@schemavaults/openapi-operations";
import {
  DatabaseConnectedJwtKeyManager,
  JwtKeyManagerMisconfigurationError,
} from "@/JwtKeyManager";
import MockJwtKeySetsStore from "@/JwtKeyManager/JsonWebKeySetsStore/MockJwtKeySetsStore";
import { AccessTokenCookieName } from "@/AccessTokenCookieNames";
import {
  accessTokenFromCookieValue,
  bearerTokenFromAuthorizationHeader,
  createSchemaVaultsAuthResolvers,
  type CreateSchemaVaultsAuthResolversOptions,
} from "./create-schemavaults-auth-resolvers";

const environment = "test" as const satisfies SchemaVaultsAppEnvironment;
const API_SERVER_ID = "resolver-test-api-server";
const COOKIE = AccessTokenCookieName(API_SERVER_ID);

class MockJwtKeyManager extends DatabaseConnectedJwtKeyManager {
  public constructor(
    store: MockJwtKeySetsStore,
    private readonly configured: boolean = true,
  ) {
    super(store);
  }
  public isConfigured(): boolean {
    return this.configured;
  }
}

function mockUser(overrides: Partial<UserData> = {}): UserData {
  const uid = crypto.randomUUID();
  return {
    uid,
    sub: uid,
    email: "resolvers-test@example.com",
    email_verified: true,
    created_at: Date.now(),
    admin: false,
    disabled: false,
    ...overrides,
  };
}

async function mint(user: UserData, scope?: string, client_app_id: string = DEFAULT_AUTH_SERVER_APP_ID) {
  const jwt_keys: JWT_Keys = await generateNewJwtKeySet({ audience_id: API_SERVER_ID, environment });
  const store = new MockJwtKeySetsStore();
  await store.storeKeySet(jwt_keys);
  const factory = new JWT_Factory({
    user,
    client_app_id,
    jwt_keys,
    environment,
    user_organizations: [],
  });
  const access = await factory.access(API_SERVER_ID, scope ? { scope } : undefined);
  return { store, factory, token: access.token, jti: access.jti };
}

const define = createOperationDefiner<{ id: number }, UserData>();
const cookieScheme = schemaVaultsAccessTokenCookieScheme(COOKIE);

const whoami = define({
  method: "get",
  path: "/api/whoami",
  summary: "Who am I",
  auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme, cookieScheme] }),
  responses: {
    200: {
      description: "ok",
      schema: z.object({
        uid: z.string(),
        scheme: z.string(),
        admin: z.boolean(),
        scope: z.string().nullable(),
        client_id: z.string().nullable(),
      }),
    },
  },
  handler: (ctx) =>
    ctx.json(200, {
      uid: ctx.auth.user.uid,
      scheme: ctx.auth.scheme,
      admin: ctx.auth.isAdmin,
      scope: ctx.auth.scope,
      client_id: ctx.auth.clientId ?? null,
    }),
});

const adminOnly = define({
  method: "get",
  path: "/api/admin",
  summary: "Admin",
  auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme], routeGuard: "admin" }),
  responses: { 200: { description: "ok", schema: z.object({ ok: z.boolean() }) } },
  handler: (ctx) => ctx.json(200, { ok: true }),
});

function appWith(store: MockJwtKeySetsStore, options: Partial<CreateSchemaVaultsAuthResolversOptions> = {}) {
  return createOperationsApp<{ id: number }, UserData>({
    operations: [whoami, adminOnly],
    context: () => ({ id: 1 }),
    authResolvers: createSchemaVaultsAuthResolvers<{ id: number }>({
      apiServerId: API_SERVER_ID,
      environment,
      jwtKeysManager: new MockJwtKeyManager(store),
      ...options,
    }),
  });
}

const originalEnv = { ...process.env };
beforeEach(() => {
  delete process.env.SCHEMAVAULTS_API_SERVER_ID;
  delete process.env.SCHEMAVAULTS_RESOURCE_URL;
});
afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

describe("createSchemaVaultsAuthResolvers", () => {
  it("registers resolvers for both SchemaVaults access-token schemes", () => {
    const resolvers = createSchemaVaultsAuthResolvers();
    expect(Object.keys(resolvers).sort()).toEqual([
      "schemavaults-access-token",
      "schemavaults-access-token-cookie",
    ]);
    expect(schemaVaultsAccessTokenBearerScheme.name).toBe("schemavaults-access-token");
    expect(cookieScheme.name).toBe("schemavaults-access-token-cookie");
  });

  it("resolves a bearer access token to the user with its scope and client app", async () => {
    const user = mockUser();
    const { store, token } = await mint(user, "openid email");
    const res = await appWith(store).request("/api/whoami", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      uid: user.uid,
      scheme: "schemavaults-access-token",
      admin: false,
      scope: "openid email",
      client_id: DEFAULT_AUTH_SERVER_APP_ID,
    });
  });

  it("names the client app a token was issued to, so third-party clients can be told apart", async () => {
    const user = mockUser();
    const { store, token } = await mint(user, "notes:read", "example-mcp-client");
    const app = appWith(store);
    const bearer = await app.request("/api/whoami", { headers: { authorization: `Bearer ${token}` } });
    expect(await bearer.json()).toMatchObject({ scope: "notes:read", client_id: "example-mcp-client" });
    const cookie = await app.request("/api/whoami", { headers: { cookie: `${COOKIE}=${token}` } });
    expect(await cookie.json()).toMatchObject({ scheme: "schemavaults-access-token-cookie", client_id: "example-mcp-client" });
  });

  it("resolves the JSON access-token cookie written by the auth provider, and a raw JWT cookie", async () => {
    const user = mockUser({ admin: true });
    const { store, token } = await mint(user);
    const app = appWith(store);
    const blob = JSON.stringify({ type: "access", token, exp: Date.now() + 60_000, aud: API_SERVER_ID });
    const json = await app.request("/api/whoami", { headers: { cookie: `a=1; ${COOKIE}=${encodeURIComponent(blob)}` } });
    expect(json.status).toBe(200);
    expect(await json.json()).toMatchObject({ uid: user.uid, scheme: "schemavaults-access-token-cookie", admin: true });

    const rawJson = await app.request("/api/whoami", { headers: { cookie: `${COOKIE}=${blob}` } });
    expect(rawJson.status).toBe(200);

    const raw = await app.request("/api/whoami", { headers: { cookie: `${COOKIE}=${token}` } });
    expect(raw.status).toBe(200);
    expect(await raw.json()).toMatchObject({ uid: user.uid });
  });

  it("skips an expired cookie blob and a missing cookie, letting the runtime answer 401 with a challenge", async () => {
    const user = mockUser();
    const { store, token } = await mint(user);
    const app = appWith(store);
    const expired = JSON.stringify({ type: "access", token, exp: Date.now() - 1 });
    const res = await app.request("/api/whoami", { headers: { cookie: `${COOKIE}=${encodeURIComponent(expired)}` } });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer realm="schemavaults"');
    expect(await res.json()).toEqual({ success: false, error: "unauthorized", message: "Authentication required" });

    const other = await app.request("/api/whoami", { headers: { cookie: `access_token_other=${token}` } });
    expect(other.status).toBe(401);
  });

  it("rejects a malformed Authorization header with 401 invalid_request", async () => {
    const { store } = await mint(mockUser());
    const app = appWith(store);
    for (const authorization of ["Basic abc", "Bearer", "Bearer a b"]) {
      const res = await app.request("/api/whoami", { headers: { authorization } });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe('Bearer realm="schemavaults", error="invalid_request"');
      expect(await res.json()).toMatchObject({ success: false, error: "invalid_request" });
    }
  });

  it("rejects a token that does not verify with 401 invalid_token", async () => {
    const { store, token } = await mint(mockUser());
    const app = appWith(store);
    const garbage = await app.request("/api/whoami", { headers: { authorization: "Bearer not-a-jwt" } });
    expect(garbage.status).toBe(401);
    expect(garbage.headers.get("www-authenticate")).toBe('Bearer realm="schemavaults", error="invalid_token"');
    expect(await garbage.json()).toMatchObject({ error: "invalid_token" });

    // A token minted for another API server (different keyset / audience).
    const foreign = await appWith(new MockJwtKeySetsStore()).request("/api/whoami", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(foreign.status).toBe(401);
    expect(await foreign.json()).toMatchObject({ error: "invalid_token" });
  });

  it("accepts tokens for the SCHEMAVAULTS_RESOURCE_URL resource URL, with or without a trailing slash", async () => {
    const { store, factory } = await mint(mockUser());
    const forResource = (await factory.access("https://api.example.com")).token;
    const forResourceSlash = (await factory.access("https://api.example.com/")).token;
    const forOther = (await factory.access("https://other.example.com")).token;
    const status = async (app: ReturnType<typeof appWith>, token: string) =>
      (await app.request("/api/whoami", { headers: { authorization: `Bearer ${token}` } })).status;

    // Without a resource URL a URL-audience token fails the audience check.
    expect(await status(appWith(store), forResource)).toBe(401);

    process.env.SCHEMAVAULTS_RESOURCE_URL = "https://api.example.com";
    const app = appWith(store);
    expect(await status(app, forResource)).toBe(200);
    expect(await status(app, forResourceSlash)).toBe(200);
    expect(await status(app, forOther)).toBe(401);

    // Explicit acceptedAudiences add to it.
    const both = appWith(store, { acceptedAudiences: ["https://other.example.com"] });
    expect(await status(both, forOther)).toBe(200);
    expect(await status(both, forResource)).toBe(200);
  });

  it("answers 500 naming SCHEMAVAULTS_RESOURCE_URL when it is not a valid resource URL", async () => {
    process.env.SCHEMAVAULTS_RESOURCE_URL = "https://api.example.com/?tenant=1";
    const { store, token } = await mint(mockUser());
    const res = await appWith(store).request("/api/whoami", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      error: "auth_not_configured",
      message: expect.stringContaining("SCHEMAVAULTS_RESOURCE_URL"),
    });
  });

  it("rejects a revoked token with 401 token_revoked", async () => {
    const user = mockUser();
    const { store, token, jti } = await mint(user);
    const seen: string[] = [];
    const app = appWith(store, {
      isTokenRevoked: (claims) => {
        seen.push(`${claims.type}:${claims.jti ?? "none"}:${claims.uid}`);
        return true;
      },
    });
    const res = await app.request("/api/whoami", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "token_revoked" });
    expect(seen).toEqual([`access:${jti ?? "none"}:${user.uid}`]);
  });

  it("refuses a disabled account with 403", async () => {
    const { store, token } = await mint(mockUser({ disabled: true }));
    const res = await appWith(store).request("/api/whoami", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "account_disabled" });
  });

  it("feeds isAdmin into the admin route guard", async () => {
    const plain = await mint(mockUser());
    const denied = await appWith(plain.store).request("/api/admin", { headers: { authorization: `Bearer ${plain.token}` } });
    expect(denied.status).toBe(403);
    const admin = await mint(mockUser({ admin: true }));
    const allowed = await appWith(admin.store).request("/api/admin", { headers: { authorization: `Bearer ${admin.token}` } });
    expect(allowed.status).toBe(200);
  });

  it("answers 500 (never a silent pass) when the JWT key manager is not configured", async () => {
    const { store, token } = await mint(mockUser());
    const app = appWith(store, { jwtKeysManager: new MockJwtKeyManager(store, false) });
    const res = await app.request("/api/whoami", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      success: false,
      error: "auth_not_configured",
      message: expect.stringContaining("not configured"),
    });
  });

  it("answers 500 naming SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY when the default key manager has no key", async () => {
    delete process.env.SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY;
    const { token } = await mint(mockUser());
    const app = createOperationsApp<unknown, UserData>({
      operations: [whoami],
      authResolvers: createSchemaVaultsAuthResolvers({
        apiServerId: API_SERVER_ID,
        environment,
        authServerUrl: "http://localhost:6767",
      }),
    });
    const res = await app.request("/api/whoami", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      error: "auth_not_configured",
      message: expect.stringContaining("SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY"),
    });
    // No credential at all is still the runtime's 401, not a 500.
    const anonymous = await app.request("/api/whoami");
    expect(anonymous.status).toBe(401);
  });

  it("answers 500 instead of 401 when the auth server refuses the JWKS download or the JWKS access key is unusable", async () => {
    const { token } = await mint(mockUser());
    const cases = [
      {
        error: new JwtKeyManagerMisconfigurationError("jwks_download_refused", "refused", { status: 401 }),
        message: "refused to send this API server's JWKS",
      },
      {
        error: new JwtKeyManagerMisconfigurationError("jwks_access_private_key_unusable", "unusable"),
        message: "SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY",
      },
    ];
    for (const { error, message } of cases) {
      const app = appWith(new MockJwtKeySetsStore(), {
        jwtKeysManager: { loadJwks: () => Promise.reject(error), isConfigured: () => true },
      });
      const res = await app.request("/api/whoami", { headers: { authorization: `Bearer ${token}` } });
      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({
        error: "auth_not_configured",
        message: expect.stringContaining(message),
      });
    }
  });

  it("answers 500 when the API server id cannot be determined, but only once a credential is presented", async () => {
    const { store, token } = await mint(mockUser());
    const app = createOperationsApp<unknown, UserData>({
      operations: [whoami],
      authResolvers: createSchemaVaultsAuthResolvers({ environment, jwtKeysManager: new MockJwtKeyManager(store) }),
    });
    expect((await app.request("/api/whoami")).status).toBe(401);
    const res = await app.request("/api/whoami", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ message: expect.stringContaining("SCHEMAVAULTS_API_SERVER_ID") });

    // ... and reads it from the environment on first use when set.
    process.env.SCHEMAVAULTS_API_SERVER_ID = API_SERVER_ID;
    const fromEnv = createOperationsApp<unknown, UserData>({
      operations: [whoami],
      authResolvers: createSchemaVaultsAuthResolvers({ environment, jwtKeysManager: new MockJwtKeyManager(store) }),
    });
    const ok = await fromEnv.request("/api/whoami", { headers: { cookie: `${COOKIE}=${token}` } });
    expect(ok.status).toBe(200);
  });

  it("getOrganizationRole rejects malformed organization ids without calling the auth server", async () => {
    const user = mockUser();
    const { store, token } = await mint(user);
    const members = define({
      method: "get",
      path: "/api/organizations/{organization_id}/members",
      summary: "Members",
      auth: requireAuth({
        schemes: [schemaVaultsAccessTokenBearerScheme],
        organization: { parameter: "organization_id", roles: [] },
      }),
      request: { params: z.object({ organization_id: z.string() }) },
      responses: { 200: { description: "ok", schema: z.object({ ok: z.boolean() }) } },
      handler: (ctx) => ctx.json(200, { ok: true }),
    });
    const app = createOperationsApp<unknown, UserData>({
      operations: [members],
      authResolvers: createSchemaVaultsAuthResolvers({
        apiServerId: API_SERVER_ID,
        environment,
        jwtKeysManager: new MockJwtKeyManager(store),
        // Never reached for a malformed id; would fail the request if it were.
        authServerUrl: "http://127.0.0.1:1",
      }),
    });
    // A malformed id can never name an organization the user belongs to: 403, not a lookup failure (500).
    const res = await app.request("/api/organizations/NOT%20AN%20ORG%20ID!/members", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "not_an_organization_member" });
  });

  it("membership lookups forward the presented access token as the subject token", async () => {
    const user = mockUser();
    const { store, token } = await mint(user);
    const [privateKey] = await new SigningKeyPairFactory().generate("pem");
    process.env.SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY = privateKey;

    const memberships = define({
      method: "get",
      path: "/api/my-organizations",
      summary: "My organizations",
      auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme, cookieScheme] }),
      responses: {
        200: {
          description: "ok",
          schema: z.object({ organizations: z.array(z.string()), role: z.union([z.string(), z.literal(false)]) }),
        },
      },
      handler: async (ctx) => {
        const listed = (await ctx.auth.listOrganizationMemberships?.()) ?? [];
        const role = (await ctx.auth.getOrganizationRole?.("globex")) ?? false;
        return ctx.json(200, { organizations: listed.map((m) => m.organization_id), role });
      },
    });
    const app = createOperationsApp<unknown, UserData>({
      operations: [memberships],
      authResolvers: createSchemaVaultsAuthResolvers({
        apiServerId: API_SERVER_ID,
        environment,
        jwtKeysManager: new MockJwtKeyManager(store),
        authServerUrl: "https://auth.example.com",
      }),
    });

    const requests: { url: string; headers: Headers }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      requests.push({ url, headers: new Headers(init?.headers) });
      const body = url.endsWith("/organizations")
        ? {
            success: true,
            data: {
              uid: user.uid,
              organization_membership_visibility: "all_organizations",
              memberships: [
                { organization_id: "acme", organization_name: "Acme", role: "owner", created_at: 1, joined_at: 2 },
              ],
            },
          }
        : { success: true, data: { organization_id: "globex", uid: user.uid, role: "member" } };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    try {
      const credentials: Record<string, string>[] = [
        { authorization: `Bearer ${token}` },
        { cookie: `${COOKIE}=${token}` },
      ];
      for (const headers of credentials) {
        requests.length = 0;
        const res = await app.request("/api/my-organizations", { headers });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ organizations: ["acme"], role: "member" });
        expect(requests.map((r) => r.url)).toEqual([
          `https://auth.example.com/api/resource-server/users/${user.uid}/organizations`,
          `https://auth.example.com/api/resource-server/organizations/globex/members/${user.uid}/role`,
        ]);
        for (const request of requests) {
          expect(request.headers.get("x-subject-token")).toBe(token);
          expect(request.headers.get("x-api-server-id")).toBe(API_SERVER_ID);
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("accessTokenFromCookieValue", () => {
  it("handles JSON blobs, expiry and raw tokens", () => {
    expect(accessTokenFromCookieValue(JSON.stringify({ token: "a.b.c", exp: Date.now() + 1000 }))).toBe("a.b.c");
    expect(accessTokenFromCookieValue(JSON.stringify({ token: "a.b.c", exp: Date.now() - 1000 }))).toBeNull();
    expect(accessTokenFromCookieValue(JSON.stringify({ token: "a.b.c" }))).toBe("a.b.c");
    expect(accessTokenFromCookieValue(JSON.stringify({ token: "" }))).toBeNull();
    expect(accessTokenFromCookieValue(JSON.stringify({ exp: 1 }))).toBeNull();
    expect(accessTokenFromCookieValue("{not json")).toBeNull();
    expect(accessTokenFromCookieValue("a.b.c")).toBe("a.b.c");
    expect(accessTokenFromCookieValue("   ")).toBeNull();
  });
});

describe("bearerTokenFromAuthorizationHeader", () => {
  it("distinguishes absent, malformed and bearer credentials", () => {
    expect(bearerTokenFromAuthorizationHeader(undefined)).toEqual({ kind: "absent" });
    expect(bearerTokenFromAuthorizationHeader("")).toEqual({ kind: "absent" });
    expect(bearerTokenFromAuthorizationHeader("bearer abc")).toEqual({ kind: "token", token: "abc" });
    expect(bearerTokenFromAuthorizationHeader("  Bearer   abc ")).toEqual({ kind: "token", token: "abc" });
    expect(bearerTokenFromAuthorizationHeader("Bearer")).toEqual({ kind: "malformed" });
    expect(bearerTokenFromAuthorizationHeader("Basic abc")).toEqual({ kind: "malformed" });
    expect(bearerTokenFromAuthorizationHeader("Bearer a b")).toEqual({ kind: "malformed" });
  });
});
