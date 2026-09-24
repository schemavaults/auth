import { describe, expect, test } from "bun:test";
import { z } from "../zod-openapi";
import { createOperationDefiner, type AuthPrincipal, type UserAuthPrincipal } from "../operation";
import {
  apiKeyHeaderScheme,
  defineAuthScheme,
  publicAccess,
  requireAuth,
  schemaVaultsAccessTokenBearerScheme,
  schemaVaultsAccessTokenCookieScheme,
  schemeResolvesUser,
  type AllSchemesResolveUser,
} from "../auth-scheme";
import { createOperationsApp } from "./create-operations-app";
import { OperationError, isOperationError } from "./errors";
import { requireUser, type AuthResolvers } from "./resolve-auth";

interface User {
  uid: string;
  admin: boolean;
}

const define = createOperationDefiner<unknown, User>();
const cookie = schemaVaultsAccessTokenCookieScheme("access_token_test");
const cronKey = apiKeyHeaderScheme("cron-key", "X-Cron-Key");
const userSchemes = [schemaVaultsAccessTokenBearerScheme, cookie] as const;

type IsTrue<T extends true> = T;
type IsFalse<T extends false> = T;
// Type-level contract of AllSchemesResolveUser (exported only so the
// aliases count as used; `bun run typecheck` verifies them).
export type AllSchemesResolveUserContract = [
  IsTrue<AllSchemesResolveUser<typeof userSchemes>>,
  IsFalse<AllSchemesResolveUser<readonly [typeof schemaVaultsAccessTokenBearerScheme, typeof cronKey]>>,
  IsFalse<AllSchemesResolveUser<readonly (typeof schemaVaultsAccessTokenBearerScheme | typeof cronKey)[]>>,
  IsFalse<AllSchemesResolveUser<readonly []>>,
];

const me = define({
  method: "get",
  path: "/api/me",
  summary: "Me",
  auth: requireAuth({ schemes: userSchemes }),
  responses: { 200: { description: "ok", schema: z.object({ uid: z.string() }) } },
  handler: (ctx) => {
    // ctx.auth.user is `User`, not `User | null`: no narrowing needed.
    const principal: UserAuthPrincipal<User> = ctx.auth;
    const uid: string = ctx.auth.user.uid;
    return ctx.json(200, { uid: `${uid}:${principal.scheme}` });
  },
});

const mixed = define({
  method: "get",
  path: "/api/mixed",
  summary: "Mixed",
  auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme, cronKey] }),
  responses: { 200: { description: "ok", schema: z.object({ uid: z.string() }) } },
  handler: (ctx) => {
    // Still nullable when a non-user scheme is accepted; requireUser() narrows.
    const principal: AuthPrincipal<User> = ctx.auth;
    const user = requireUser(principal);
    return ctx.json(200, { uid: user.uid });
  },
});

const open = define({
  method: "get",
  path: "/api/open",
  summary: "Open",
  auth: publicAccess(),
  responses: { 200: { description: "ok", schema: z.object({ uid: z.string() }) } },
  handler: (ctx) => {
    const auth: null = ctx.auth;
    void auth;
    return ctx.json(200, { uid: requireUser<User>(ctx.auth).uid });
  },
});

const brokenScheme = defineAuthScheme({
  name: "broken-user-scheme",
  principal: "user",
  title: "Broken",
  securityScheme: { type: "apiKey", in: "header", name: "X-Broken" },
});

const broken = define({
  method: "get",
  path: "/api/broken",
  summary: "Broken resolver",
  auth: requireAuth({ schemes: [brokenScheme] }),
  responses: { 200: { description: "ok", schema: z.object({ uid: z.string() }) } },
  handler: (ctx) => ctx.json(200, { uid: ctx.auth.user.uid }),
});

const authResolvers: AuthResolvers<User> = {
  [schemaVaultsAccessTokenBearerScheme.name]: (c) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) return null;
    return { scheme: schemaVaultsAccessTokenBearerScheme.name, user: { uid: header.slice(7), admin: false }, isAdmin: false, scope: null };
  },
  [cookie.name]: (c) => {
    const value = c.req.header("cookie");
    if (!value?.startsWith("access_token_test=")) return null;
    return { scheme: cookie.name, user: { uid: value.split("=")[1] ?? "", admin: false }, isAdmin: false, scope: null };
  },
  [cronKey.name]: (c) =>
    c.req.header("x-cron-key") === "secret"
      ? { scheme: cronKey.name, user: null, isAdmin: true, scope: null, clientId: "cron" }
      : null,
  [brokenScheme.name]: (c) =>
    c.req.header("x-broken") ? { scheme: brokenScheme.name, user: null, isAdmin: false, scope: null } : null,
};

const app = createOperationsApp<unknown, User>({ operations: [me, mixed, open, broken], authResolvers });

describe("principal: \"user\" schemes", () => {
  test("built-in SchemaVaults token schemes resolve users", () => {
    expect(schemeResolvesUser(schemaVaultsAccessTokenBearerScheme)).toBe(true);
    expect(schemeResolvesUser(cookie)).toBe(true);
    expect(schemeResolvesUser(cronKey)).toBe(false);
    expect(schemaVaultsAccessTokenBearerScheme.principal).toBe("user");
    expect(cronKey.principal).toBeUndefined();
  });

  test("defineAuthScheme rejects unknown principal kinds", () => {
    expect(() =>
      defineAuthScheme({
        name: "bad",
        principal: "robot" as never,
        title: "Bad",
        securityScheme: { type: "apiKey", in: "header", name: "X" },
      }),
    ).toThrow(/unknown principal kind/);
  });

  test("handlers of user-only operations receive the user", async () => {
    const bearer = await app.request("/api/me", { headers: { authorization: "Bearer alice" } });
    expect(bearer.status).toBe(200);
    expect(await bearer.json()).toEqual({ uid: "alice:schemavaults-access-token" });

    const viaCookie = await app.request("/api/me", { headers: { cookie: "access_token_test=bob" } });
    expect(await viaCookie.json()).toEqual({ uid: "bob:schemavaults-access-token-cookie" });
  });

  test("a user scheme whose resolver yields no user fails closed with 401", async () => {
    const res = await app.request("/api/broken", { headers: { "x-broken": "1" } });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("unauthorized");
    expect(body.message).toMatch(/does not identify a user/);
  });
});

describe("requireUser", () => {
  test("narrows a principal with a user", async () => {
    const res = await app.request("/api/mixed", { headers: { authorization: "Bearer alice" } });
    expect(await res.json()).toEqual({ uid: "alice" });
  });

  test("rejects non-user principals and public operations with 401", async () => {
    const cron = await app.request("/api/mixed", { headers: { "x-cron-key": "secret" } });
    expect(cron.status).toBe(401);
    expect(await cron.json()).toEqual({
      success: false,
      error: "unauthorized",
      message: "This operation requires a signed-in user",
    });
    const anonymous = await app.request("/api/open");
    expect(anonymous.status).toBe(401);
  });
});

describe("isOperationError", () => {
  test("accepts instances and structurally identical errors from another package copy", () => {
    expect(isOperationError(new OperationError(404, { error: "not_found", message: "x" }))).toBe(true);
    const foreign = Object.assign(new Error("x"), {
      name: "OperationError",
      status: 409,
      body: { success: false, error: "conflict", message: "x" },
      headers: {},
      toResponse: () => new Response(null, { status: 409 }),
    });
    expect(isOperationError(foreign)).toBe(true);
    expect(isOperationError(new Error("x"))).toBe(false);
    expect(isOperationError({ status: 500 })).toBe(false);
    expect(isOperationError(null)).toBe(false);
  });

  test("the runtime short-circuits on a foreign OperationError", async () => {
    const thrower = define({
      method: "get",
      path: "/api/foreign",
      summary: "Foreign",
      auth: publicAccess(),
      responses: { 200: { description: "never", schema: z.object({}) }, 409: { description: "conflict" } },
      handler: () => {
        throw Object.assign(new Error("conflict"), {
          name: "OperationError",
          status: 409,
          body: { success: false, error: "conflict", message: "already exists" },
          headers: {},
          toResponse: () =>
            new Response(JSON.stringify({ success: false, error: "conflict", message: "already exists" }), {
              status: 409,
              headers: { "content-type": "application/json" },
            }),
        });
      },
    });
    const res = await createOperationsApp({ operations: [thrower] }).request("/api/foreign");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "conflict" });
  });
});
