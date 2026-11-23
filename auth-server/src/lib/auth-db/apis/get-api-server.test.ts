import { describe, expect, test } from "bun:test";
import { getApiServer } from "./get-api-server";

const API_SERVER_ID = "example-api";

/** An `api_servers` row as the `pg` driver returns it (BIGINT as a string). */
const ROW = {
  api_server_id: API_SERVER_ID,
  api_server_name: "Example API",
  api_server_description: "An example API server",
  created_at: "1700000000000",
  public: false,
  hardcoded: false,
  owner_type: "organization",
  owner_organization_id: "acme-corp",
  owner_uid: null,
  created_by: null,
  allow_dynamic_clients: false,
  resource_url_match_mode: "exact",
  organization_membership_visibility: "owning_organization",
  accept_delegated_tokens: false,
};

/** A Kysely stand-in whose select chain resolves to `rows`. */
function fakeDb(rows: unknown[]) {
  const builder: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return undefined;
        if (prop === "execute") return async () => rows;
        return () => builder;
      },
    },
  );
  return builder as never;
}

describe("getApiServer", () => {
  test("parses its database row", async () => {
    const api_server = await getApiServer(fakeDb([ROW]), API_SERVER_ID);
    expect(api_server?.api_server_id).toBe(API_SERVER_ID);
    expect(api_server?.created_at).toBe(1_700_000_000_000);
  });

  test("returns null when no row matches", async () => {
    expect(await getApiServer(fakeDb([]), API_SERVER_ID)).toBeNull();
  });

  // A row that fails the schema is a server-side fault, not bad caller
  // input: callers of resolveTokenAudience() (token, revocation and token
  // exchange endpoints) treat a TypeError as an invalid request, so this
  // must never be one.
  test("a row that fails the definition schema is an Error (not a TypeError) carrying the zod error", async () => {
    let err: Error | undefined;
    try {
      await getApiServer(fakeDb([{ ...ROW, api_server_name: "x".repeat(65) }]), API_SERVER_ID);
    } catch (e: unknown) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TypeError);
    expect(err?.message).toBe("Failed to parse API server from database");
    const cause = err?.cause as { name: string; issues: { path: unknown[] }[] };
    expect(cause.name).toBe("ZodError");
    expect(cause.issues.map((issue) => issue.path[0])).toContain("api_server_name");
  });
});
