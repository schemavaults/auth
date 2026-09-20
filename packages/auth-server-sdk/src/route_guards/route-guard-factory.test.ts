import { describe, it, expect } from "bun:test";
import {
  DEFAULT_AUTH_SERVER_APP_ID,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import {
  generateNewJwtKeySet,
  JWT_Factory,
  type JWT_Keys,
} from "@schemavaults/jwt";
import { DatabaseConnectedJwtKeyManager } from "@/JwtKeyManager";
import MockJwtKeySetsStore from "@/JwtKeyManager/JsonWebKeySetsStore/MockJwtKeySetsStore";
import RouteGuardFactory from "./route-guard-factory";
import {
  evaluateTokenRevocation,
  type DecodedTokenClaims,
} from "./token-revocation";

const environment = "test" as const satisfies SchemaVaultsAppEnvironment;

class MockJwtKeyManager extends DatabaseConnectedJwtKeyManager {
  public constructor(store: MockJwtKeySetsStore) {
    super(store);
  }
  public isConfigured(): boolean {
    return true;
  }
}

function createMockUser(): UserData {
  const uid = crypto.randomUUID();
  return {
    uid,
    sub: uid,
    email: "route-guard-factory-test@example.com",
    email_verified: true,
    created_at: Date.now(),
    admin: false,
    disabled: false,
  };
}

async function mintRefreshToken(): Promise<{
  user: UserData;
  keys_manager: MockJwtKeyManager;
  token: string;
  jti: string | undefined;
}> {
  const user = createMockUser();
  const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
    audience_id: DEFAULT_AUTH_SERVER_APP_ID,
    environment,
  });
  const store = new MockJwtKeySetsStore();
  await store.storeKeySet(jwt_keys);
  const factory = new JWT_Factory({
    user,
    client_app_id: DEFAULT_AUTH_SERVER_APP_ID,
    jwt_keys,
    environment,
    user_organizations: [],
  });
  const refresh = await factory.refresh();
  return {
    user,
    keys_manager: new MockJwtKeyManager(store),
    token: refresh.token,
    jti: refresh.jti,
  };
}

const refreshSource = (token: string) =>
  [{ sourceHint: "Auth Server Refresh Token", type: "refresh", token }] as const;

describe("RouteGuardFactory revocation hook", () => {
  it("resolves the user when no is_token_revoked hook is configured", async () => {
    const { user, keys_manager, token } = await mintRefreshToken();
    const guard = await new RouteGuardFactory({
      environment,
      is_auth_server: true,
      jwt_keys_manager: keys_manager,
    }).createGuardFromTokenSources(
      "authenticated",
      refreshSource(token),
      DEFAULT_AUTH_SERVER_APP_ID,
    );
    expect(guard.user?.uid).toBe(user.uid);
    expect(guard.revoked).toBe(false);
    expect(guard.isAccessAllowed()).toBe(true);
  });

  it("passes the verified token's claims to the hook and allows access when it returns false", async () => {
    const { user, keys_manager, token, jti } = await mintRefreshToken();
    const seen: DecodedTokenClaims[] = [];
    const guard = await new RouteGuardFactory({
      environment,
      is_auth_server: true,
      jwt_keys_manager: keys_manager,
      is_token_revoked: async (claims) => {
        seen.push(claims);
        return false;
      },
    }).createGuardFromTokenSources(
      "authenticated",
      refreshSource(token),
      DEFAULT_AUTH_SERVER_APP_ID,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ jti, uid: user.uid, type: "refresh" });
    expect(typeof seen[0]?.iat).toBe("number");
    expect(guard.user?.uid).toBe(user.uid);
    expect(guard.revoked).toBe(false);
  });

  it("denies a cryptographically valid token the hook reports as revoked", async () => {
    const { keys_manager, token } = await mintRefreshToken();
    const guard = await new RouteGuardFactory({
      environment,
      is_auth_server: true,
      jwt_keys_manager: keys_manager,
      is_token_revoked: async () => true,
    }).createGuardFromTokenSources(
      "authenticated",
      refreshSource(token),
      DEFAULT_AUTH_SERVER_APP_ID,
    );
    expect(guard.user).toBeNull();
    expect(guard.scope).toBeNull();
    expect(guard.revoked).toBe(true);
    expect(guard.isAccessAllowed()).toBe(false);
  });

  it("fails closed when the hook throws", async () => {
    const { keys_manager, token } = await mintRefreshToken();
    const guard = await new RouteGuardFactory({
      environment,
      is_auth_server: true,
      jwt_keys_manager: keys_manager,
      is_token_revoked: async () => {
        throw new Error("revocation store unavailable");
      },
    }).createGuardFromTokenSources(
      "authenticated",
      refreshSource(token),
      DEFAULT_AUTH_SERVER_APP_ID,
    );
    expect(guard.user).toBeNull();
    expect(guard.revoked).toBe(true);
    expect(guard.isAccessAllowed()).toBe(false);
  });

  it("does not consult the hook for tokens that fail verification", async () => {
    const { keys_manager } = await mintRefreshToken();
    let calls = 0;
    const guard = await new RouteGuardFactory({
      environment,
      is_auth_server: true,
      jwt_keys_manager: keys_manager,
      is_token_revoked: async () => {
        calls++;
        return false;
      },
    }).createGuardFromTokenSources(
      "authenticated",
      refreshSource("definitely.not.a.token"),
      DEFAULT_AUTH_SERVER_APP_ID,
    );
    expect(calls).toBe(0);
    expect(guard.user).toBeNull();
    expect(guard.revoked).toBe(false);
  });

  it("rejects a non-function is_token_revoked option", () => {
    expect(
      () =>
        new RouteGuardFactory({
          environment,
          is_auth_server: true,
          jwt_keys_manager: new MockJwtKeyManager(new MockJwtKeySetsStore()),
          is_token_revoked: "nope" as unknown as () => boolean,
        }),
    ).toThrow(TypeError);
  });
});

describe("evaluateTokenRevocation", () => {
  const claims = (jti: string): DecodedTokenClaims => ({
    jti,
    iat: 1_700_000_000,
    uid: "11111111-1111-4111-8111-111111111111",
    type: "access",
  });

  it("is not revoked when every token passes", async () => {
    const result = await evaluateTokenRevocation(async () => false, [
      claims("a"),
      claims("b"),
    ]);
    expect(result.revoked).toBe(false);
    expect(result.token).toBeUndefined();
  });

  it("is revoked as soon as any presented token is revoked", async () => {
    const result = await evaluateTokenRevocation(
      async (t) => t.jti === "b",
      [claims("a"), claims("b"), claims("c")],
    );
    expect(result.revoked).toBe(true);
    expect(result.token?.jti).toBe("b");
  });

  it("accepts a synchronous hook", async () => {
    const result = await evaluateTokenRevocation(() => true, [claims("a")]);
    expect(result.revoked).toBe(true);
  });

  it("fails closed and reports the error when the hook throws", async () => {
    const boom = new Error("boom");
    const result = await evaluateTokenRevocation(
      () => {
        throw boom;
      },
      [claims("a")],
    );
    expect(result.revoked).toBe(true);
    expect(result.error).toBe(boom);
  });

  it("is not revoked for an empty token list", async () => {
    const result = await evaluateTokenRevocation(async () => true, []);
    expect(result.revoked).toBe(false);
  });
});
