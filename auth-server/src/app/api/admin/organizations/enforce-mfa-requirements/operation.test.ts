import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthResolvers } from "@schemavaults/openapi-operations";
import type { UserData } from "@schemavaults/auth-common";
import type { AuthServerApiContext } from "@/lib/api/context";

// The operation's imports pull in the `server-only` marker, which throws
// outside a React Server Components bundle.
mock.module("server-only", () => ({}));

// The enforcement itself needs a database; these tests are about who may
// trigger it, so it is replaced by a stub that counts its runs.
let runs: { uid?: string }[] = [];
mock.module("./enforce-handler", () => ({
  ENFORCE_ORGANIZATION_MFA_REQUIREMENTS_ROUTE: "/api/admin/organizations/enforce-mfa-requirements",
  enforceOrganizationMfaRequirementsHandler: async ({ uid }: { uid?: string }) => {
    runs.push({ uid });
    return Response.json({ success: true, message: "enforced", data: {} });
  },
}));

const ROUTE = "/api/admin/organizations/enforce-mfa-requirements";
const CRON_SECRET = "test-cron-secret-0123456789";
const ADMIN_UID = "77777777-7777-4777-8777-777777777777";
const USER_UID = "66666666-6666-4666-8666-666666666666";

/**
 * The real operations and cron secret resolver; the session resolvers are
 * stubbed: `Bearer admin-token` is a platform administrator, `Bearer
 * user-token` a regular user, anything else nobody.
 */
async function app() {
  const { createOperationsApp } = await import("@schemavaults/openapi-operations");
  const { accessTokenBearerScheme, accessTokenCookieScheme, cronSecretScheme, sessionCookieScheme } = await import(
    "@/lib/api/auth-schemes"
  );
  const { cronSecretResolver } = await import("@/lib/api/auth-resolvers/cron-secret");
  const { enforceOrganizationMfaRequirementsViaGet, enforceOrganizationMfaRequirementsViaPost } = await import(
    "./operation"
  );
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
    operations: [enforceOrganizationMfaRequirementsViaGet, enforceOrganizationMfaRequirementsViaPost],
    authResolvers,
    context: () => ({ db: {}, redis: {}, environment: "test", debug: false }) as unknown as AuthServerApiContext,
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

describe("GET /api/admin/organizations/enforce-mfa-requirements (scheduled job)", () => {
  test("runs the enforcement for the deployment's cron secret", async () => {
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

describe("POST /api/admin/organizations/enforce-mfa-requirements (administrators)", () => {
  test("runs the enforcement for a platform administrator", async () => {
    const response = await call("POST", "Bearer admin-token");
    expect(response.status).toBe(200);
    expect(runs).toEqual([{ uid: ADMIN_UID }]);
  });

  test("refuses the cron secret", async () => {
    const response = await call("POST", `Bearer ${CRON_SECRET}`);
    expect(response.status).toBe(401);
    expect(runs).toEqual([]);
  });

  test("refuses a regular user (403) and an anonymous caller (401)", async () => {
    expect((await call("POST", "Bearer user-token")).status).toBe(403);
    expect((await call("POST")).status).toBe(401);
    expect(runs).toEqual([]);
  });
});
