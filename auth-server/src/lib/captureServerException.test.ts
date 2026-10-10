import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { buildErrorRow, captureServerException } = await import("./captureServerException");

const UID = "0b6f1f9e-58c5-4c0e-9d34-2f4f3f5f7a10";

function parsedContext(row: { context?: unknown }): unknown {
  expect(typeof row.context).toBe("string");
  return JSON.parse(row.context as string);
}

describe("buildErrorRow", () => {
  test("records name, message, stack and the given options", () => {
    const err = new TypeError("boom");
    const row = buildErrorRow(err, {
      op_name: "op",
      route: "/api/thing",
      uid: UID,
      context: { a: 1 },
    });
    expect(row.name).toBe("TypeError");
    expect(row.message).toBe("boom");
    expect(row.stack).toContain("TypeError: boom");
    expect(row.op_name).toBe("op");
    expect(row.route).toBe("/api/thing");
    expect(row.uid).toBe(UID);
    expect(parsedContext(row)).toEqual({ a: 1 });
  });

  test("renders the cause chain into the stack", () => {
    const root = new Error("connection terminated");
    const err = new Error("Failed to load keyset", { cause: root });
    const row = buildErrorRow(err);
    expect(row.stack).toContain("Error: Failed to load keyset");
    expect(row.stack).toContain("Caused by: Error: connection terminated");
  });

  test("renders the members of an AggregateError", () => {
    const err = new AggregateError(
      [new Error("redis quit failed"), "pool end failed"],
      "Failed to release request resources",
    );
    const row = buildErrorRow(err);
    expect(row.stack).toContain("Aggregated error [0]: Error: redis quit failed");
    expect(row.stack).toContain("Aggregated error [1]: pool end failed");
  });

  test("survives a cause cycle", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    (a as Error & { cause?: unknown }).cause = b;
    const row = buildErrorRow(a);
    expect(row.stack).toContain("Caused by: Error: b");
  });

  test("keeps database error fields as error_details", () => {
    const err = Object.assign(new Error('duplicate key value violates unique constraint "users_pkey"'), {
      code: "23505",
      detail: "Key (uid)=(x) already exists.",
      constraint: "users_pkey",
      table: "users",
      routine: undefined,
    });
    const row = buildErrorRow(err, { context: { target: "x" } });
    expect(parsedContext(row)).toEqual({
      target: "x",
      error_details: {
        code: "23505",
        detail: "Key (uid)=(x) already exists.",
        constraint: "users_pkey",
        table: "users",
      },
    });
  });

  test("binds array and string contexts as JSON text", () => {
    expect(parsedContext(buildErrorRow(new Error("x"), { context: ["a", "b"] }))).toEqual(["a", "b"]);
    expect(parsedContext(buildErrorRow(new Error("x"), { context: "plain" }))).toBe("plain");
  });

  test("serializes what JSON cannot hold", () => {
    const circular: Record<string, unknown> = { big: BigInt(10), fn: () => 1 };
    circular.self = circular;
    const row = buildErrorRow(new Error("x"), { context: circular });
    expect(parsedContext(row)).toEqual({ big: "10", self: "[Circular]" });
  });

  test("replaces NUL characters, which Postgres rejects", () => {
    const row = buildErrorRow(new Error("bad\u0000input"), { context: { v: "a\u0000b" } });
    expect(row.message).toBe("bad�input");
    expect(row.stack).not.toContain("\u0000");
    expect(row.context).not.toContain("\\u0000");
  });

  test("moves a uid that is not a uuid into the context", () => {
    const row = buildErrorRow(new Error("x"), { uid: "app|not-a-uuid", context: { a: 1 } });
    expect(row.uid).toBeNull();
    expect(parsedContext(row)).toEqual({ a: 1, uid: "app|not-a-uuid" });
  });

  test("wraps a non-object context when adding details", () => {
    const err = Object.assign(new Error("x"), { code: "ECONNREFUSED" });
    expect(parsedContext(buildErrorRow(err, { context: "label" }))).toEqual({
      context: "label",
      error_details: { code: "ECONNREFUSED" },
    });
  });

  test("records thrown non-errors", () => {
    expect(buildErrorRow("just a string")).toMatchObject({
      name: "UnknownError",
      message: "just a string",
      stack: null,
      context: null,
    });
    expect(buildErrorRow({ status: 500 }).message).toBe('{"status":500}');
    expect(buildErrorRow(undefined).message).toBe("undefined");
  });

  test("treats error-shaped objects from another realm as errors", () => {
    const row = buildErrorRow({ name: "NeonDbError", message: "timeout", code: "57014" });
    expect(row.name).toBe("NeonDbError");
    expect(row.message).toBe("timeout");
    expect(parsedContext(row)).toEqual({ error_details: { code: "57014" } });
  });
});

describe("captureServerException", () => {
  function fakeDb(execute: () => Promise<unknown>) {
    const rows: unknown[] = [];
    const db = {
      insertInto: () => ({
        values: (row: unknown) => {
          rows.push(row);
          return { execute };
        },
      }),
    };
    return { db: db as never, rows };
  }

  test("inserts the row", async () => {
    const { db, rows } = fakeDb(async () => []);
    await captureServerException(db, new Error("x"), { op_name: "op" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Error", message: "x", op_name: "op" });
  });

  test("never throws when the insert fails", async () => {
    const { db } = fakeDb(async () => {
      throw new Error("db down");
    });
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      await expect(captureServerException(db, new Error("x"))).resolves.toBeUndefined();
    } finally {
      console.error = originalConsoleError;
    }
  });
});
