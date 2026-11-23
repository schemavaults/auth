import { describe, expect, test } from "bun:test";
import type { SchemaVaultsApiServerDomainRef } from "@schemavaults/app-definitions";
import { addApiServerDomain } from "./add-api-server-domain";

const API_SERVER_ID = "example-api";

const DOMAIN_REF: SchemaVaultsApiServerDomainRef = {
  api_server_domain_ref_id: "0b6f6a4e-8c2d-4f1a-9a3b-2c1d0e9f8a7b",
  api_server_id: API_SERVER_ID,
  domain: "https://api.example.com",
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

describe("addApiServerDomain", () => {
  test("a domain ref that fails its schema is a TypeError carrying the zod error", async () => {
    const err = await rejectionOf(
      addApiServerDomain(fakeDb(), API_SERVER_ID, {
        ...DOMAIN_REF,
        api_server_domain_ref_id: "not-a-guid",
      }),
    );
    expect(err).toBeInstanceOf(TypeError);
    expect(err.message).toBe("Received invalid API server domain to associate with API server");
    const cause = err.cause as { name: string; issues: { path: unknown[] }[] };
    expect(cause.name).toBe("ZodError");
    expect(cause.issues.map((issue) => issue.path[0])).toContain("api_server_domain_ref_id");
  });

  test("a ref naming another API server is a TypeError", async () => {
    const err = await rejectionOf(addApiServerDomain(fakeDb(), "other-api", DOMAIN_REF));
    expect(err).toBeInstanceOf(TypeError);
    expect(err.message).toBe("API server ID mismatch");
  });

  test("a failed insert is an Error (not a TypeError) carrying the database error", async () => {
    const insert_error = new Error("Connection terminated unexpectedly");
    const err = await rejectionOf(addApiServerDomain(fakeDb({ insert_error }), API_SERVER_ID, DOMAIN_REF));
    expect(err).not.toBeInstanceOf(TypeError);
    expect(err.message).toBe("Failed to add new API server domain; db insert failed");
    expect(err.cause).toBe(insert_error);
  });

  test("a valid ref is inserted", async () => {
    await addApiServerDomain(fakeDb(), API_SERVER_ID, DOMAIN_REF);
  });
});
