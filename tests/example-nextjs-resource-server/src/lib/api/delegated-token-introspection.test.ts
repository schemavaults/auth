import { describe, expect, mock, test } from "bun:test";
import type { UserData } from "@schemavaults/auth-server-sdk";
import {
  OperationError,
  type AuthPrincipal,
  type AuthResolver,
  type AuthSchemeDefinition,
} from "@schemavaults/openapi-operations";

mock.module("server-only", () => ({}));
const { withDelegatedTokenIntrospection } = await import("./delegated-token-introspection");

const BEARER = "schemavaults-access-token";
const scheme = { name: BEARER } as AuthSchemeDefinition;

function context(authorization: string | undefined): Parameters<AuthResolver>[0] {
  return {
    req: { header: (name: string) => (name.toLowerCase() === "authorization" ? authorization : undefined) },
  } as unknown as Parameters<AuthResolver>[0];
}

function principal(actor: AuthPrincipal["actor"]): AuthPrincipal<UserData> {
  return { scheme: BEARER, user: null, isAdmin: false, scope: "openid", ...(actor ? { actor } : {}) };
}

async function resolveWith(
  resolved: AuthPrincipal<UserData> | null,
  introspect: (token: string) => Promise<boolean>,
): Promise<{ result?: AuthPrincipal<UserData> | null; error?: unknown; introspected: string[] }> {
  const introspected: string[] = [];
  const resolvers = withDelegatedTokenIntrospection<null>(
    { [BEARER]: () => resolved },
    async (token) => {
      introspected.push(token);
      return introspect(token);
    },
  );
  try {
    return { result: await resolvers[BEARER]!(context("Bearer the-token"), scheme, null), introspected };
  } catch (error: unknown) {
    return { error, introspected };
  }
}

describe("withDelegatedTokenIntrospection", () => {
  test("leaves the user's own tokens on the local fast path", async () => {
    const own = principal(undefined);
    const { result, introspected } = await resolveWith(own, async () => false);
    expect(result).toBe(own);
    expect(introspected).toEqual([]);
  });

  test("lets an active delegated token through", async () => {
    const delegated = principal({ sub: "auth|agent", clientId: "client" });
    const { result, introspected } = await resolveWith(delegated, async () => true);
    expect(result).toBe(delegated);
    expect(introspected).toEqual(["the-token"]);
  });

  test("refuses a delegated token the auth server no longer reports active", async () => {
    const { error } = await resolveWith(principal({ sub: "auth|agent" }), async () => false);
    expect(error).toBeInstanceOf(OperationError);
    expect((error as OperationError).status).toBe(401);
    expect((error as OperationError).body.error).toBe("token_revoked");
  });

  test("fails closed when the auth server cannot be asked", async () => {
    const { error } = await resolveWith(principal({ sub: "auth|agent" }), async () => {
      throw new Error("ECONNREFUSED");
    });
    expect((error as OperationError).status).toBe(503);
  });

  test("passes unauthenticated requests through to the operation's own handling", async () => {
    const { result, introspected } = await resolveWith(null, async () => true);
    expect(result).toBeNull();
    expect(introspected).toEqual([]);
  });
});
