import { describe, it, expect } from "bun:test";
import { z } from "zod";
import {
  DEFAULT_AUTH_SERVER_APP_ID,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { userDataSchema, type UserData } from "@schemavaults/auth-common";
import { type GenerateJWTOptions, generateJWT } from "./generate";
import { decodeJWT } from "./decode";
import getRefreshTokenAudience from "./get_refresh_token_audience";
import { generateNewJwtKeySet, type JWT_Keys } from "./jwt_keys";
import { createJwtPayloadSchema, type CustomJWTPayload } from "./payload_data";
import {
  createJwtActorClaimSchema,
  type JwtActorClaim,
} from "./actor-claim";
import {
  customJwtPayloadToUserData,
  getActorFromCustomJwtPayload,
} from "./custom-jwt-payload-to-user-data";
import MockUser from "@/tests/MockUser";

const env = "test" as const satisfies SchemaVaultsAppEnvironment;
const environment = env;
const auth_server_url: string = getAuthServerUrl(env);

const agent_uid = crypto.randomUUID();
const agent_app_id = crypto.randomUUID();

const threeLevelChain: JwtActorClaim = {
  sub: crypto.randomUUID(),
  client_id: agent_app_id,
  act: {
    sub: crypto.randomUUID(),
    act: { sub: crypto.randomUUID(), client_id: "schemavaults-auth" },
  },
};

// Each of these must be refused by both generation and the payload schema.
const invalidActors: readonly [string, unknown][] = [
  ["missing sub", { client_id: agent_app_id }],
  ["non-uuid sub", { sub: "not-a-uuid" }],
  ["a non-identity member (exp)", { sub: agent_uid, exp: 1 }],
  ["a non-identity member in a prior actor", { sub: agent_uid, act: { sub: agent_uid, aud: "x" } }],
  [
    "a 4th level",
    {
      sub: agent_uid,
      act: { sub: agent_uid, act: { sub: agent_uid, act: { sub: agent_uid } } },
    },
  ],
  ["a malformed client_id", { sub: agent_uid, client_id: "Not An App Id!" }],
  ["a non-object", "agent"],
];

async function apiServerKeys(api_server_id: string): Promise<JWT_Keys> {
  return await generateNewJwtKeySet({ audience_id: api_server_id, environment });
}

function accessOptions(
  jwt_keys: JWT_Keys,
  audience: string,
  user: UserData,
): GenerateJWTOptions<"access"> {
  return {
    type: "access",
    user,
    audience,
    iat: Date.now(),
    client_app_id: crypto.randomUUID(),
    auth_server_url,
    jwt_keys,
    env,
  };
}

async function decodeAccess(
  token: string,
  audience: string,
  jwt_keys: JWT_Keys,
): Promise<CustomJWTPayload> {
  return await decodeJWT({ jwt: token, type: "access", audience, jwt_keys, env });
}

describe("RFC 8693 actor (act) claim", () => {
  it("round-trips an actor on access tokens", async () => {
    const api_server_id = crypto.randomUUID();
    const jwt_keys = await apiServerKeys(api_server_id);
    const actor: JwtActorClaim = { sub: agent_uid, client_id: agent_app_id };

    const jwt = await generateJWT({
      ...accessOptions(jwt_keys, api_server_id, new MockUser()),
      actor,
    });
    const decoded = await decodeAccess(jwt.token, api_server_id, jwt_keys);

    expect(decoded.act).toEqual(actor);
  });

  it("round-trips a 3-level delegation chain", async () => {
    const api_server_id = crypto.randomUUID();
    const jwt_keys = await apiServerKeys(api_server_id);

    const jwt = await generateJWT({
      ...accessOptions(jwt_keys, api_server_id, new MockUser()),
      actor: threeLevelChain,
    });
    const decoded = await decodeAccess(jwt.token, api_server_id, jwt_keys);

    expect(decoded.act).toEqual(threeLevelChain);
  });

  it("decodes tokens without an actor exactly as before", async () => {
    const api_server_id = crypto.randomUUID();
    const jwt_keys = await apiServerKeys(api_server_id);
    const user = new MockUser();
    const options = accessOptions(jwt_keys, api_server_id, user);

    const jwt = await generateJWT(options);
    const decoded = await decodeAccess(jwt.token, api_server_id, jwt_keys);

    expect(decoded).not.toHaveProperty("act");
    expect(Object.keys(decoded).sort()).toEqual(
      [
        "uid",
        "sub",
        "email",
        "email_verified",
        "aud",
        "app",
        "admin",
        "disabled",
        "created_at",
        "sig",
        "iss",
        "env",
        "jti",
        "iat",
      ].sort(),
    );
    expect(getActorFromCustomJwtPayload(decoded)).toBeNull();
  });

  it("refuses an actor on refresh tokens", async () => {
    const jwt_keys = await generateNewJwtKeySet({
      audience_id: DEFAULT_AUTH_SERVER_APP_ID,
      environment,
    });
    await expect(
      generateJWT({
        type: "refresh",
        user: new MockUser(),
        audience: getRefreshTokenAudience(env),
        iat: Date.now(),
        client_app_id: crypto.randomUUID(),
        auth_server_url,
        jwt_keys,
        env,
        actor: { sub: agent_uid },
      }),
    ).rejects.toThrow("Only access tokens may carry an actor");
  });

  for (const [label, actor] of invalidActors) {
    it(`refuses to generate a token whose actor has ${label}`, async () => {
      const api_server_id = crypto.randomUUID();
      const jwt_keys = await apiServerKeys(api_server_id);
      await expect(
        generateJWT({
          ...accessOptions(jwt_keys, api_server_id, new MockUser()),
          actor: actor as JwtActorClaim,
        }),
      ).rejects.toThrow("Invalid 'actor'");
    });

    it(`the payload schema refuses an act claim with ${label}`, () => {
      const uid = crypto.randomUUID();
      const payload = {
        uid,
        sub: uid,
        email: "agent-test@example.com",
        email_verified: true,
        aud: auth_server_url,
        app: DEFAULT_AUTH_SERVER_APP_ID,
        admin: false,
        disabled: false,
        created_at: Date.now(),
        sig: "a".repeat(64),
        iss: auth_server_url,
        env,
        iat: Math.floor(Date.now() / 1000),
      };
      const schema = createJwtPayloadSchema(z, environment);
      expect(schema.safeParse(payload).success).toBeTrue();
      expect(schema.safeParse({ ...payload, act: { sub: agent_uid } }).success).toBeTrue();
      expect(schema.safeParse({ ...payload, act: actor }).success).toBeFalse();
    });
  }

  it("accepts exactly the documented actor shapes", () => {
    const schema = createJwtActorClaimSchema(z);
    expect(schema.safeParse({ sub: agent_uid }).success).toBeTrue();
    expect(schema.safeParse(threeLevelChain).success).toBeTrue();
  });

  describe("getActorFromCustomJwtPayload", () => {
    const uid = crypto.randomUUID();
    const payload: CustomJWTPayload = {
      uid,
      sub: uid,
      email: "agent-test@example.com",
      email_verified: true,
      admin: false,
      disabled: false,
      created_at: Date.now(),
      aud: auth_server_url,
      app: DEFAULT_AUTH_SERVER_APP_ID,
      sig: "a".repeat(64),
      iss: auth_server_url,
      env,
      iat: Math.floor(Date.now() / 1000),
    };

    it("returns null when the token names no actor", () => {
      expect(getActorFromCustomJwtPayload(payload)).toBeNull();
    });

    it("builds the OIDC subject of every actor in the chain", () => {
      const chain = threeLevelChain;
      expect(
        getActorFromCustomJwtPayload({ ...payload, act: chain }, "acme-auth"),
      ).toEqual({
        uid: chain.sub,
        sub: `acme-auth|${chain.sub}`,
        client_id: agent_app_id,
        prior_actor: {
          uid: chain.act!.sub,
          sub: `acme-auth|${chain.act!.sub}`,
          client_id: null,
          prior_actor: {
            uid: chain.act!.act!.sub,
            sub: `acme-auth|${chain.act!.act!.sub}`,
            client_id: "schemavaults-auth",
            prior_actor: null,
          },
        },
      });
    });

    it("defaults the subject prefix to the auth server app id", () => {
      const original = process.env.SCHEMAVAULTS_AUTH_SERVER_APP_ID;
      process.env.SCHEMAVAULTS_AUTH_SERVER_APP_ID = "white-label-auth";
      try {
        expect(
          getActorFromCustomJwtPayload({ ...payload, act: { sub: agent_uid } })?.sub,
        ).toBe(`white-label-auth|${agent_uid}`);
      } finally {
        if (original === undefined) {
          delete process.env.SCHEMAVAULTS_AUTH_SERVER_APP_ID;
        } else {
          process.env.SCHEMAVAULTS_AUTH_SERVER_APP_ID = original;
        }
      }
    });

    it("never folds the actor into UserData", async () => {
      const userData = customJwtPayloadToUserData({
        ...payload,
        act: threeLevelChain,
      });
      expect(userData).not.toHaveProperty("act");
      expect(userData).not.toHaveProperty("actor");
      expect(userData).toEqual(customJwtPayloadToUserData(payload));
      expect((await userDataSchema.safeParseAsync(userData)).success).toBeTrue();
    });
  });
});
