import { describe, expect, test } from "bun:test";
import type { Context } from "hono";
import { z } from "../zod-openapi";
import { createOperationDefiner, type AuthPrincipal } from "../operation";
import { requireAuth, schemaVaultsAccessTokenBearerScheme } from "../auth-scheme";
import { buildOpenApiDocument } from "../openapi/build-openapi-document";
import {
  isSchemaVaultsAuthExtension,
  SCHEMAVAULTS_AUTH_EXTENSION,
} from "../openapi/extensions";
import { createOperationsApp } from "./create-operations-app";
import { isDelegatedPrincipal, type AuthResolvers } from "./resolve-auth";

interface User {
  uid: string;
}

const define = createOperationDefiner<undefined, User>();
const schemes = [schemaVaultsAccessTokenBearerScheme] as const;
const ok = { 200: { description: "ok", schema: z.object({ uid: z.string(), actor: z.string().nullable() }) } };

const readNotes = define({
  method: "get",
  path: "/api/notes",
  summary: "Read notes (agents welcome)",
  auth: requireAuth({ schemes, requiredScopes: ["notes:read"] }),
  responses: ok,
  handler: (ctx) => ctx.json(200, { uid: ctx.auth.user.uid, actor: ctx.auth.actor?.sub ?? null }),
});

const deleteAccount = define({
  method: "delete",
  path: "/api/account",
  summary: "Delete the account (never an agent)",
  auth: requireAuth({ schemes, requiredScopes: ["account:delete"], delegatedCallers: "refused" }),
  responses: ok,
  handler: (ctx) => ctx.json(200, { uid: ctx.auth.user.uid, actor: null }),
});

const adminOnly = define({
  method: "post",
  path: "/api/admin/purge",
  summary: "Admin task (never an agent)",
  auth: requireAuth({ schemes, routeGuard: "admin", delegatedCallers: "refused" }),
  responses: ok,
  handler: (ctx) => ctx.json(200, { uid: ctx.auth.user.uid, actor: null }),
});

const explicitlyAllowed = define({
  method: "get",
  path: "/api/status",
  summary: "Status (agents explicitly welcome)",
  auth: requireAuth({ schemes, delegatedCallers: "allowed" }),
  responses: ok,
  handler: (ctx) => ctx.json(200, { uid: ctx.auth.user.uid, actor: ctx.auth.actor?.sub ?? null }),
});

/**
 * `Bearer <uid>[:admin][+agent]`: `+agent` names an actor (a delegated
 * token), as `createSchemaVaultsAuthResolvers()` does for an `act` claim.
 */
const authResolvers: AuthResolvers<User, undefined> = {
  [schemaVaultsAccessTokenBearerScheme.name]: (c: Context): AuthPrincipal<User> | null => {
    const token = c.req.header("authorization")?.replace(/^Bearer /, "");
    if (!token) return null;
    const delegated = token.endsWith("+agent");
    const [uid, role] = token.replace(/\+agent$/, "").split(":");
    return {
      scheme: schemaVaultsAccessTokenBearerScheme.name,
      user: { uid: uid! },
      isAdmin: role === "admin",
      scope: "notes:read account:delete",
      ...(delegated ? { actor: { sub: "agent-service-account", clientId: "the-app" } } : {}),
    };
  },
};

const app = createOperationsApp<undefined, User>({
  operations: [readNotes, deleteAccount, adminOnly, explicitlyAllowed],
  authResolvers,
});

function call(method: string, path: string, token: string): Promise<Response> {
  return Promise.resolve(app.request(path, { method, headers: { authorization: `Bearer ${token}` } }));
}

describe("delegatedCallers", () => {
  test("operations accept delegated callers by default", async () => {
    const own = await call("GET", "/api/notes", "alice");
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({ uid: "alice", actor: null });

    const delegated = await call("GET", "/api/notes", "alice+agent");
    expect(delegated.status).toBe(200);
    expect(await delegated.json()).toEqual({ uid: "alice", actor: "agent-service-account" });

    const allowed = await call("GET", "/api/status", "alice+agent");
    expect(allowed.status).toBe(200);
  });

  test('"refused" answers 403 to a delegated caller and lets the user through', async () => {
    const delegated = await call("DELETE", "/api/account", "alice+agent");
    expect(delegated.status).toBe(403);
    expect(await delegated.json()).toMatchObject({
      success: false,
      error: "delegated_caller_refused",
    });
    // Not a scope problem: no insufficient_scope challenge.
    expect(delegated.headers.get("www-authenticate")).toBeNull();

    const own = await call("DELETE", "/api/account", "alice");
    expect(own.status).toBe(200);
  });

  test("no administrator bypass: the credential kind is checked first", async () => {
    const delegatedAdmin = await call("POST", "/api/admin/purge", "root:admin+agent");
    expect(delegatedAdmin.status).toBe(403);
    expect(await delegatedAdmin.json()).toMatchObject({ error: "delegated_caller_refused" });

    expect((await call("POST", "/api/admin/purge", "root:admin")).status).toBe(200);
    // A delegated non-admin still learns about the credential kind first.
    const delegatedUser = await call("POST", "/api/admin/purge", "alice+agent");
    expect(await delegatedUser.json()).toMatchObject({ error: "delegated_caller_refused" });
  });

  test("requireAuth() refuses an unknown policy", () => {
    expect(() =>
      requireAuth({
        schemes,
        // @ts-expect-error -- not a policy
        delegatedCallers: "maybe",
      }),
    ).toThrow(TypeError);
  });

  test("isDelegatedPrincipal() reads the actor", () => {
    const base = { scheme: "s", user: null, isAdmin: false, scope: null };
    expect(isDelegatedPrincipal(base)).toBe(false);
    expect(isDelegatedPrincipal({ ...base, actor: { sub: "agent" } })).toBe(true);
  });
});

describe("delegatedCallers in the OpenAPI document", () => {
  const doc = buildOpenApiDocument({
    info: { title: "Test API", version: "1.0.0" },
    operations: [readNotes, deleteAccount, explicitlyAllowed],
    documentRuntimeResponses: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const operation = (path: string, method: string): any => (doc.paths as any)[path][method];

  test("the extension carries the policy only when the operation declares it", () => {
    const refused = operation("/api/account", "delete")[SCHEMAVAULTS_AUTH_EXTENSION];
    expect(refused.delegatedCallers).toBe("refused");
    expect(isSchemaVaultsAuthExtension(refused)).toBe(true);

    const allowed = operation("/api/status", "get")[SCHEMAVAULTS_AUTH_EXTENSION];
    expect(allowed.delegatedCallers).toBe("allowed");

    const unset = operation("/api/notes", "get")[SCHEMAVAULTS_AUTH_EXTENSION];
    expect("delegatedCallers" in unset).toBe(false);
    expect(isSchemaVaultsAuthExtension(unset)).toBe(true);
  });

  test("the runtime 403 is documented with the reason", () => {
    expect(operation("/api/account", "delete").responses["403"].description).toContain(
      "delegated credential",
    );
    expect(operation("/api/notes", "get").responses["403"].description).not.toContain(
      "delegated credential",
    );
  });

  test("isSchemaVaultsAuthExtension() refuses an unknown policy", () => {
    const refused = operation("/api/account", "delete")[SCHEMAVAULTS_AUTH_EXTENSION];
    expect(isSchemaVaultsAuthExtension({ ...refused, delegatedCallers: "maybe" })).toBe(false);
  });
});
