import { describe, expect, test } from "bun:test";
import type { SchemaVaultsAppDomainRef } from "@schemavaults/app-definitions";
import { addAppDomain } from "./add-app-domain";

const APP_ID = "example-app";

const DOMAIN_REF: SchemaVaultsAppDomainRef = {
  app_domain_ref_id: "3c9e1f2a-7b4d-4e8f-a1c2-d3e4f5a6b7c8",
  app_id: APP_ID,
  domain: "https://app.example.com",
  environment: "development",
  created_at: 1_700_000_000_000,
  hardcoded: false,
};

/**
 * A Kysely stand-in: every builder method chains, `execute()` (the
 * existing-domains lookup) finds no rows, and `executeTakeFirst()` (the
 * insert) fails with `insert_error` when given.
 */
function fakeDb(opts: { insert_error?: unknown } = {}) {
  const builder: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return undefined;
        if (prop === "execute") return async () => [];
        if (prop === "executeTakeFirst") {
          return async () => {
            if (opts.insert_error !== undefined) throw opts.insert_error;
            return { numInsertedOrUpdatedRows: BigInt(1) };
          };
        }
        return () => builder;
      },
    },
  );
  return builder as never;
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (e: unknown) {
    return e as Error;
  }
  throw new Error("Expected the promise to reject");
}

describe("addAppDomain", () => {
  test("a domain ref that fails its schema is a TypeError carrying the zod error", async () => {
    const err = await rejectionOf(
      addAppDomain(fakeDb(), APP_ID, { ...DOMAIN_REF, app_domain_ref_id: "not-a-guid" }),
    );
    expect(err).toBeInstanceOf(TypeError);
    expect(err.message).toBe("Received invalid app domain to associate with app");
    const cause = err.cause as { name: string; issues: { path: unknown[] }[] };
    expect(cause.name).toBe("ZodError");
    expect(cause.issues.map((issue) => issue.path[0])).toContain("app_domain_ref_id");
  });

  test("a ref naming another app is a TypeError", async () => {
    const err = await rejectionOf(addAppDomain(fakeDb(), "other-app", DOMAIN_REF));
    expect(err).toBeInstanceOf(TypeError);
    expect(err.message).toBe("App ID mismatch");
  });

  test("a failed insert is an Error (not a TypeError) carrying the database error", async () => {
    const insert_error = new Error("Connection terminated unexpectedly");
    const err = await rejectionOf(addAppDomain(fakeDb({ insert_error }), APP_ID, DOMAIN_REF));
    expect(err).not.toBeInstanceOf(TypeError);
    expect(err.message).toBe("Failed to add new app domain; db insert failed");
    expect(err.cause).toBe(insert_error);
  });

  test("a valid ref is inserted", async () => {
    await addAppDomain(fakeDb(), APP_ID, DOMAIN_REF);
  });
});
