import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  DEFAULT_AUTH_SERVER_APP_ID,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import { generateNewJwtKeySet, JWT_Factory, type JWT_Keys } from "@schemavaults/jwt";
import {
  createOperationsApp,
  createOperationDefiner,
  requireAuth,
  schemaVaultsAccessTokenBearerScheme,
  schemaVaultsAccessTokenCookieScheme,
  z,
} from "@schemavaults/openapi-operations";
import { DatabaseConnectedJwtKeyManager } from "@/JwtKeyManager";
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

async function mint(user: UserData, scope?: string) {
  const jwt_keys: JWT_Keys = await generateNewJwtKeySet({ audience_id: API_SERVER_ID, environment });
  const store = new MockJwtKeySetsStore();
  await store.storeKeySet(jwt_keys);
  const factory = new JWT_Factory({
    user,
    client_app_id: DEFAULT_AUTH_SERVER_APP_ID,
    jwt_keys,
    environment,
    user_organizations: [],
  });
  const access = await factory.access(API_SERVER_ID, scope ? { scope } : undefined);
  return { store, token: access.token, jti: access.jti };
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
      schema: z.object({ uid: z.string(), scheme: z.string(), admin: z.boolean(), scope: z.string().nullable() }),
    },
  },
  handler: (ctx) =>
    ctx.json(200, { uid: ctx.auth.user.uid, scheme: ctx.auth.scheme, admin: ctx.auth.isAdmin, scope: ctx.auth.scope }),
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

  it("resolves a bearer access token to the user with its scope", async () => {
    const user = mockUser();
    const { store, token } = await mint(user, "openid email");
    const res = await appWith(store).request("/api/whoami", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      uid: user.uid,
      scheme: "schemavaults-access-token",
      admin: false,
      scope: "openid email",
    });
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
