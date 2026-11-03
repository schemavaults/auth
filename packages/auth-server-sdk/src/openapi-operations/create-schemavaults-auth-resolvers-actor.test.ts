import { describe, expect, it } from "bun:test";
import {
  DEFAULT_AUTH_SERVER_APP_ID,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import {
  generateNewJwtKeySet,
  JWT_Factory,
  type JwtActorClaim,
  type JWT_Keys,
} from "@schemavaults/jwt";
import {
  createOperationsApp,
  createOperationDefiner,
  OperationError,
  requireAuth,
  schemaVaultsAccessTokenBearerScheme,
  z,
} from "@schemavaults/openapi-operations";
import { DatabaseConnectedJwtKeyManager } from "@/JwtKeyManager";
import MockJwtKeySetsStore from "@/JwtKeyManager/JsonWebKeySetsStore/MockJwtKeySetsStore";
import { createSchemaVaultsAuthResolvers } from "./create-schemavaults-auth-resolvers";

// The RFC 8693 actor (`act`) of an access token reaches the principal the
// resolvers build as `actor`, next to (and from the same token as) `clientId`.

const environment = "test" as const satisfies SchemaVaultsAppEnvironment;
const API_SERVER_ID = "resolver-actor-test-api-server";
const CLIENT_APP_ID = "example-agent-client";

class MockJwtKeyManager extends DatabaseConnectedJwtKeyManager {
  public isConfigured(): boolean {
    return true;
  }
}

function mockUser(): UserData {
  const uid = crypto.randomUUID();
  return {
    uid,
    sub: uid,
    email: "resolvers-actor-test@example.com",
    email_verified: true,
    created_at: Date.now(),
    admin: false,
    disabled: false,
  };
}

async function mint(actor?: JwtActorClaim) {
  const jwt_keys: JWT_Keys = await generateNewJwtKeySet({ audience_id: API_SERVER_ID, environment });
  const store = new MockJwtKeySetsStore();
  await store.storeKeySet(jwt_keys);
  const access = await new JWT_Factory({
    user: mockUser(),
    client_app_id: CLIENT_APP_ID,
    jwt_keys,
    environment,
    user_organizations: [],
  }).access(API_SERVER_ID, actor ? { actor } : undefined);
  return { store, token: access.token };
}

const define = createOperationDefiner<{ id: number }, UserData>();
const auth = requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme] });

const principal = define({
  method: "get",
  path: "/api/principal",
  summary: "Principal",
  auth,
  responses: {
    200: {
      description: "ok",
      schema: z.object({
        client_id: z.string().nullable(),
        has_actor: z.boolean(),
        actor: z.unknown(),
      }),
    },
  },
  handler: (ctx) =>
    ctx.json(200, {
      client_id: ctx.auth.clientId ?? null,
      has_actor: "actor" in ctx.auth,
      actor: ctx.auth.actor ?? null,
    }),
});

// The README's example: a sensitive operation that refuses delegated tokens.
const sensitive = define({
  method: "post",
  path: "/api/sensitive",
  summary: "Sensitive",
  auth,
  responses: { 200: { description: "ok", schema: z.object({ ok: z.boolean() }) } },
  handler: (ctx) => {
    if (ctx.auth.actor) {
      throw new OperationError(403, {
        error: "delegation_not_allowed",
        message: "Agents cannot perform this operation",
      });
    }
    return ctx.json(200, { ok: true });
  },
});

function appWith(store: MockJwtKeySetsStore) {
  return createOperationsApp<{ id: number }, UserData>({
    operations: [principal, sensitive],
    context: () => ({ id: 1 }),
    authResolvers: createSchemaVaultsAuthResolvers<{ id: number }>({
      apiServerId: API_SERVER_ID,
      environment,
      jwtKeysManager: new MockJwtKeyManager(store),
    }),
  });
}

describe("createSchemaVaultsAuthResolvers: RFC 8693 actor", () => {
  it("leaves `actor` off the principal when the token carries no act claim", async () => {
    const { store, token } = await mint();
    const res = await appWith(store).request("/api/principal", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ client_id: CLIENT_APP_ID, has_actor: false, actor: null });
  });

  it("maps the token's actor chain onto the principal, clientId unchanged", async () => {
    const agent_uid = crypto.randomUUID();
    const prior_uid = crypto.randomUUID();
    const agent_app_id = crypto.randomUUID();
    const { store, token } = await mint({
      sub: agent_uid,
      client_id: agent_app_id,
      act: { sub: prior_uid },
    });
    const res = await appWith(store).request("/api/principal", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      client_id: CLIENT_APP_ID,
      has_actor: true,
      actor: {
        sub: `${DEFAULT_AUTH_SERVER_APP_ID}|${agent_uid}`,
        clientId: agent_app_id,
        actor: { sub: `${DEFAULT_AUTH_SERVER_APP_ID}|${prior_uid}` },
      },
    });
  });

  it("lets an operation refuse delegated tokens", async () => {
    const plain = await mint();
    const plainRes = await appWith(plain.store).request("/api/sensitive", {
      method: "POST",
      headers: { authorization: `Bearer ${plain.token}` },
    });
    expect(plainRes.status).toBe(200);

    const delegated = await mint({ sub: crypto.randomUUID() });
    const delegatedRes = await appWith(delegated.store).request("/api/sensitive", {
      method: "POST",
      headers: { authorization: `Bearer ${delegated.token}` },
    });
    expect(delegatedRes.status).toBe(403);
    expect(await delegatedRes.json()).toMatchObject({ error: "delegation_not_allowed" });
  });
});
