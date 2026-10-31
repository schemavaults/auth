import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AnyOperationDefinition, OperationAuth } from "@schemavaults/openapi-operations";

// The operation modules pull in the `server-only` marker, which throws
// outside a React Server Components bundle.
mock.module("server-only", () => ({}));

/** Every scheduled job's route and its two operations. */
async function scheduledJobs(): Promise<Record<string, readonly [AnyOperationDefinition, AnyOperationDefinition]>> {
  const dailyReport = await import("@/app/api/admin/send-daily-report/operation");
  const purge = await import("@/app/api/admin/client-errors/purge-expired/operation");
  const mfa = await import("@/app/api/admin/organizations/enforce-mfa-requirements/operation");
  return {
    "/api/admin/send-daily-report": [dailyReport.sendDailyReportViaGet, dailyReport.sendDailyReportViaPost],
    "/api/admin/client-errors/purge-expired": [purge.purgeExpiredClientErrorsViaGet, purge.purgeExpiredClientErrorsViaPost],
    "/api/admin/organizations/enforce-mfa-requirements": [
      mfa.enforceOrganizationMfaRequirementsViaGet,
      mfa.enforceOrganizationMfaRequirementsViaPost,
    ],
  };
}

function schemeNames(auth: OperationAuth): readonly string[] {
  return auth.type === "required" ? auth.schemes.map((scheme) => scheme.name) : [];
}

describe("scheduled job routes", () => {
  test("GET only accepts the cron secret and POST only an administrator session", async () => {
    const { cronSecretScheme, sessionSchemes } = await import("@/lib/api/auth-schemes");
    for (const [path, [viaGet, viaPost]] of Object.entries(await scheduledJobs())) {
      expect(viaGet.method, path).toBe("get");
      expect(viaGet.path, path).toBe(path);
      expect(schemeNames(viaGet.auth), path).toEqual([cronSecretScheme.name]);

      expect(viaPost.method, path).toBe("post");
      expect(viaPost.path, path).toBe(path);
      expect(schemeNames(viaPost.auth), path).toEqual(sessionSchemes.map((scheme) => scheme.name));
      expect(viaPost.auth.type === "required" ? viaPost.auth.routeGuard : null, path).toBe("admin");
    }
  });

  test("every Vercel cron calls one of them", async () => {
    const vercel = JSON.parse(readFileSync(join(import.meta.dir, "../../../vercel.json"), "utf8")) as {
      crons?: { path: string }[];
    };
    const paths = Object.keys(await scheduledJobs());
    expect((vercel.crons ?? []).map((cron) => cron.path).sort()).toEqual([...paths].sort());
  });
});
