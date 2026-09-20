import { describe, it, expect } from "bun:test";
import {
  getTokenAudienceForApiServerId,
  DEFAULT_AUTH_SERVER_APP_ID,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import {
  generateNewJwtKeySet,
  JWT_Factory,
  type JWT_Keys,
} from "@schemavaults/jwt";
import { decodeJWTsWithKeyManager } from "./decode-jwts-with-key-manager";
import { DatabaseConnectedJwtKeyManager } from "@/JwtKeyManager";
import MockJwtKeySetsStore from "@/JwtKeyManager/JsonWebKeySetsStore/MockJwtKeySetsStore";

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
    email: "decode-jwts-test@example.com",
    email_verified: true,
    created_at: Date.now(),
    admin: false,
    disabled: false,
  };
}

async function createKeysAndManager(): Promise<{
  jwt_keys: JWT_Keys;
  keys_manager: MockJwtKeyManager;
}> {
  const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
    audience_id: DEFAULT_AUTH_SERVER_APP_ID,
    environment,
  });
  const store = new MockJwtKeySetsStore();
  await store.storeKeySet(jwt_keys);
  return { jwt_keys, keys_manager: new MockJwtKeyManager(store) };
}

// Regression test: route guards look up keysets by the stable api server id
// ("schemavaults-auth") while tokens are minted with the token-audience form
// (the auth server URL) in their `aud`/`iss` claims. decodeJWTsWithKeyManager
// must translate between the two or every guarded route 401s after login.
describe("decodeJWTsWithKeyManager", () => {
  it("decodes a refresh token when given the stable auth api server id as jwt_audience", async () => {
    const user = createMockUser();
    const { jwt_keys, keys_manager } = await createKeysAndManager();

    const factory = new JWT_Factory({
      user,
      client_app_id: DEFAULT_AUTH_SERVER_APP_ID,
      jwt_keys,
      environment,
      user_organizations: [],
    });
    const refresh_token = await factory.refresh();

    const decoded = await decodeJWTsWithKeyManager(
      keys_manager,
      [
        {
          sourceHint: "Auth Server Refresh Token",
          type: "refresh",
          token: refresh_token.token,
        },
      ],
      DEFAULT_AUTH_SERVER_APP_ID,
      environment,
    );
    const decoded_user = decoded.user;

    expect(decoded_user).not.toBeNull();
    expect(decoded_user?.uid).toBe(user.uid);
    expect(decoded_user?.email).toBe(user.email);

    // The revocation-relevant claims of the verified token are reported
    // alongside the user so route guards can consult a revocation hook.
    if (!decoded.user) throw new Error("expected a user");
    expect(decoded.tokens).toHaveLength(1);
    expect(decoded.tokens[0]).toMatchObject({
      jti: refresh_token.jti,
      iat: Math.floor(refresh_token.iat / 1000),
      uid: user.uid,
      type: "refresh",
      sourceHint: "Auth Server Refresh Token",
    });
  });

  it("reports the claims of every verified token source", async () => {
    const user = createMockUser();
    const { jwt_keys, keys_manager } = await createKeysAndManager();

    const factory = new JWT_Factory({
      user,
      client_app_id: DEFAULT_AUTH_SERVER_APP_ID,
      jwt_keys,
      environment,
      user_organizations: [],
    });
    const refresh_token = await factory.refresh();
    const access_token = await factory.access(
      getTokenAudienceForApiServerId(DEFAULT_AUTH_SERVER_APP_ID, environment),
    );

    const decoded = await decodeJWTsWithKeyManager(
      keys_manager,
      [
        { sourceHint: "refresh cookie", type: "refresh", token: refresh_token.token },
        { sourceHint: "access cookie", type: "access", token: access_token.token },
        // A garbage source neither verifies nor shows up in the claims.
        { sourceHint: "garbage", type: "access", token: "not-a-jwt" },
      ],
      DEFAULT_AUTH_SERVER_APP_ID,
      environment,
    );

    if (!decoded.user) throw new Error("expected a user");
    expect(decoded.user.uid).toBe(user.uid);
    const jtis = decoded.tokens.map((t) => t.jti).sort();
    expect(jtis).toEqual(
      [refresh_token.jti ?? null, access_token.jti ?? null].sort(),
    );
    expect(decoded.tokens.every((t) => t.uid === user.uid)).toBe(true);
    expect(decoded.tokens.map((t) => t.type).sort()).toEqual([
      "access",
      "refresh",
    ]);
  });

  it("decodes an access token for the auth server when given the stable auth api server id as jwt_audience", async () => {
    const user = createMockUser();
    const { jwt_keys, keys_manager } = await createKeysAndManager();

    const factory = new JWT_Factory({
      user,
      client_app_id: DEFAULT_AUTH_SERVER_APP_ID,
      jwt_keys,
      environment,
      user_organizations: [],
    });
    const access_token = await factory.access(
      getTokenAudienceForApiServerId(DEFAULT_AUTH_SERVER_APP_ID, environment),
    );

    const { user: decoded_user } = await decodeJWTsWithKeyManager(
      keys_manager,
      [
        {
          sourceHint: "Access Token Cookie",
          type: "access",
          token: access_token.token,
        },
      ],
      DEFAULT_AUTH_SERVER_APP_ID,
      environment,
    );

    expect(decoded_user).not.toBeNull();
    expect(decoded_user?.uid).toBe(user.uid);
  });
});
