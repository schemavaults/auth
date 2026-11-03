import { describe, it, expect } from "bun:test";
import {
  DEFAULT_AUTH_SERVER_APP_ID,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import {
  generateNewJwtKeySet,
  JWT_Factory,
  type JwtActorClaim,
  type JWT_Keys,
} from "@schemavaults/jwt";
import { DatabaseConnectedJwtKeyManager } from "@/JwtKeyManager";
import MockJwtKeySetsStore from "@/JwtKeyManager/JsonWebKeySetsStore/MockJwtKeySetsStore";
import RouteGuardFactory from "./route-guard-factory";
import type { IsTokenRevokedFn } from "./token-revocation";

// The RFC 8693 actor (`act`) of the resolving token reaches `guard.actor`,
// alongside (and from the same token as) `guard.client_app_id`.

const environment = "test" as const satisfies SchemaVaultsAppEnvironment;

class MockJwtKeyManager extends DatabaseConnectedJwtKeyManager {
  public isConfigured(): boolean {
    return true;
  }
}

function createMockUser(): UserData {
  const uid = crypto.randomUUID();
  return {
    uid,
    sub: uid,
    email: "route-guard-actor-test@example.com",
    email_verified: true,
    created_at: Date.now(),
    admin: false,
    disabled: false,
  };
}

async function guardFor(
  actor: JwtActorClaim | undefined,
  is_token_revoked?: IsTokenRevokedFn,
) {
  const user = createMockUser();
  const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
    audience_id: DEFAULT_AUTH_SERVER_APP_ID,
    environment,
  });
  const store = new MockJwtKeySetsStore();
  await store.storeKeySet(jwt_keys);
  const access = await new JWT_Factory({
    user,
    client_app_id: DEFAULT_AUTH_SERVER_APP_ID,
    jwt_keys,
    environment,
    user_organizations: [],
  }).access(getAuthServerUrl(environment), actor ? { actor } : undefined);
  const guard = await new RouteGuardFactory({
    environment,
    is_auth_server: true,
    jwt_keys_manager: new MockJwtKeyManager(store),
    ...(is_token_revoked ? { is_token_revoked } : {}),
  }).createGuardFromTokenSources(
    "authenticated",
    [{ sourceHint: "Auth Header Access Token", type: "access", token: access.token }],
    DEFAULT_AUTH_SERVER_APP_ID,
  );
  return { user, guard };
}

describe("RouteGuardFactory actor (RFC 8693 act claim)", () => {
  it("sets guard.actor for a token carrying act", async () => {
    const agent_uid = crypto.randomUUID();
    const prior_uid = crypto.randomUUID();
    const { user, guard } = await guardFor({
      sub: agent_uid,
      client_id: "example-agent-client",
      act: { sub: prior_uid },
    });

    expect(guard.user?.uid).toBe(user.uid);
    expect(guard.isAccessAllowed()).toBe(true);
    expect(guard.client_app_id).toBe(DEFAULT_AUTH_SERVER_APP_ID);
    expect(guard.actor).toEqual({
      uid: agent_uid,
      sub: `${DEFAULT_AUTH_SERVER_APP_ID}|${agent_uid}`,
      client_id: "example-agent-client",
      prior_actor: {
        uid: prior_uid,
        sub: `${DEFAULT_AUTH_SERVER_APP_ID}|${prior_uid}`,
        client_id: null,
        prior_actor: null,
      },
    });
  });

  it("leaves guard.actor null for a token without act", async () => {
    const { user, guard } = await guardFor(undefined);
    expect(guard.user?.uid).toBe(user.uid);
    expect(guard.actor).toBeNull();
  });

  it("leaves guard.actor null when the token is reported revoked", async () => {
    const { guard } = await guardFor({ sub: crypto.randomUUID() }, () => true);
    expect(guard.revoked).toBe(true);
    expect(guard.user).toBeNull();
    expect(guard.client_app_id).toBeNull();
    expect(guard.actor).toBeNull();
  });

  it("defaults the actor to null on guards built from options", () => {
    const guard = RouteGuardFactory.createGuardFromOptions("authenticated", {
      user: createMockUser(),
      environment,
    });
    expect(guard.actor).toBeNull();
  });

  it("drops a caller-supplied actor on a revoked guard", () => {
    const guard = RouteGuardFactory.createGuardFromOptions("authenticated", {
      user: createMockUser(),
      actor: {
        uid: crypto.randomUUID(),
        sub: "x",
        client_id: null,
        prior_actor: null,
      },
      revoked: true,
      environment,
    });
    expect(guard.actor).toBeNull();
  });
});
