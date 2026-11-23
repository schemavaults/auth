import { describe, expect, test } from "bun:test";
import { registerApp, type RegisterAppOptions } from "./register-app";

const OPTIONS: RegisterAppOptions = {
  app_id: "example-app",
  app_name: "Example App",
  app_description: "An example client application",
  publicly_listed: false,
  ownership: { owner_type: "organization", owner_organization_id: "acme-corp", owner_uid: null },
  web: true,
};

/** Both cases are refused before any query, so the database is never used. */
const UNUSED_DB = {} as never;

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (e: unknown) {
    return e as Error;
  }
  throw new Error("Expected the promise to reject");
}

describe("registerApp", () => {
  test("an invalid owner organization id is a TypeError carrying the zod error", async () => {
    const err = await rejectionOf(
      registerApp(UNUSED_DB, {
        ...OPTIONS,
        ownership: { owner_type: "organization", owner_organization_id: "ab", owner_uid: null },
      }),
    );
    expect(err).toBeInstanceOf(TypeError);
    expect(err.message).toBe("Received invalid organization ID to register application to!");
    expect((err.cause as { name: string }).name).toBe("ZodError");
  });

  test("options that fail the app definition schema are a TypeError carrying the zod error", async () => {
    const err = await rejectionOf(registerApp(UNUSED_DB, { ...OPTIONS, app_name: "x".repeat(129) }));
    expect(err).toBeInstanceOf(TypeError);
    expect(err.message).toBe("Failed to parse app");
    const cause = err.cause as { name: string; issues: { path: unknown[] }[] };
    expect(cause.name).toBe("ZodError");
    expect(cause.issues.map((issue) => issue.path[0])).toContain("app_name");
  });
});
