import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthResolvers } from "@schemavaults/openapi-operations";
import type { UserData } from "@schemavaults/auth-common";
import type { AuthServerApiContext } from "@/lib/api/context";
import type { ScheduledJobRun } from "@/lib/api/scheduled-job-operations";

// The auth schemes / resolvers pull in the `server-only` marker, which
// throws outside a React Server Components bundle.
mock.module("server-only", () => ({}));

const ROUTE = "/api/admin/example-job";
const CRON_SECRET = "test-cron-secret-0123456789";
const ADMIN_UID = "77777777-7777-4777-8777-777777777777";
const USER_UID = "66666666-6666-4666-8666-666666666666";

let runs: { uid?: string }[] = [];

/**
 * A job built with defineScheduledJobOperations(), behind the real cron
 * secret resolver. The session resolvers are stubbed: `Bearer admin-token`
 * is a platform administrator, `Bearer user-token` a regular user, anything
 * else nobody.
 */
async function app() {
  const { createOperationsApp, z } = await import("@schemavaults/openapi-operations");
  const { accessTokenBearerScheme, accessTokenCookieScheme, cronSecretScheme, sessionCookieScheme } = await import(
    "@/lib/api/auth-schemes"
  );
  const { cronSecretResolver } = await import("@/lib/api/auth-resolvers/cron-secret");
  const { defineScheduledJobOperations } = await import("@/lib/api/scheduled-job-operations");
  const { viaGet, viaPost } = defineScheduledJobOperations({
    path: ROUTE,
    summary: "Run the example job",
    description: "An example job.",
    result: { description: "Ran", schema: z.object({ ran: z.literal(true) }) },
    run: ({ uid }: ScheduledJobRun) => {
      runs.push({ uid });
      return Response.json({ ran: true });
    },
  });
  const authResolvers: AuthResolvers<UserData, AuthServerApiContext> = {
    [sessionCookieScheme.name]: () => null,
    [accessTokenCookieScheme.name]: () => null,
    [accessTokenBearerScheme.name]: (c, scheme) => {
      const authorization = c.req.header("authorization");
      const admin = authorization === "Bearer admin-token";
      if (!admin && authorization !== "Bearer user-token") return null;
      const uid = admin ? ADMIN_UID : USER_UID;
      return {
        scheme: scheme.name,
        user: { uid, email: `${uid}@example.com`, admin } as unknown as UserData,
        isAdmin: admin,
        scope: null,
      };
    },
    [cronSecretScheme.name]: cronSecretResolver,
  };
  return createOperationsApp<AuthServerApiContext, UserData>({
    operations: [viaGet, viaPost],
    authResolvers,
    context: () => ({ environment: "test", debug: false }) as unknown as AuthServerApiContext,
  });
}

async function call(method: "GET" | "POST", authorization?: string): Promise<Response> {
  return (await app()).request(ROUTE, {
    method,
    headers: authorization ? { Authorization: authorization } : {},
  });
}

const savedCronSecret = process.env.CRON_SECRET;

beforeEach(() => {
  runs = [];
  process.env.CRON_SECRET = CRON_SECRET;
});

afterEach(() => {
  if (savedCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedCronSecret;
});

describe("defineScheduledJobOperations GET (the scheduled job)", () => {
  test("runs the job for the deployment's cron secret", async () => {
    const response = await call("GET", `Bearer ${CRON_SECRET}`);
    expect(response.status).toBe(200);
    expect(runs).toEqual([{ uid: undefined }]);
  });

  test("refuses an administrator's access token", async () => {
    const response = await call("GET", "Bearer admin-token");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: "invalid_cron_secret" });
    expect(runs).toEqual([]);
  });

  test("refuses a wrong secret and a missing one", async () => {
    expect((await call("GET", "Bearer not-the-secret")).status).toBe(401);
    expect((await call("GET")).status).toBe(401);
    expect(runs).toEqual([]);
  });

  test("refuses everything while CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("GET", `Bearer ${CRON_SECRET}`)).status).toBe(401);
    expect((await call("GET", "Bearer ")).status).toBe(401);
    expect(runs).toEqual([]);
  });
});

describe("defineScheduledJobOperations POST (administrators)", () => {
  test("runs the job for a platform administrator", async () => {
    const response = await call("POST", "Bearer admin-token");
    expect(response.status).toBe(200);
    expect(runs).toEqual([{ uid: ADMIN_UID }]);
  });

  test("refuses the cron secret", async () => {
    expect((await call("POST", `Bearer ${CRON_SECRET}`)).status).toBe(401);
    expect(runs).toEqual([]);
  });

  test("refuses a regular user (403) and an anonymous caller (401)", async () => {
    expect((await call("POST", "Bearer user-token")).status).toBe(403);
    expect((await call("POST")).status).toBe(401);
    expect(runs).toEqual([]);
  });
});
