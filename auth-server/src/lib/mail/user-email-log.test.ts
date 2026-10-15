import { describe, expect, test } from "bun:test";
import MailServerNotConfiguredError from "@/lib/error/MailServerNotConfiguredError";
import { MAX_FAILURE_REASON_LENGTH } from "@/lib/auth-db/user-email-log";
import sendAndLogUserEmail from "./user-email-log";

const UID = "66666666-6666-4666-8666-666666666666";
const ADMIN_UID = "77777777-7777-4777-8777-777777777777";

interface RecordedInsert {
  table: string;
  row: Record<string, unknown>;
}

/**
 * Records the INSERTs issued through the Kysely builder chain
 * (insertInto → values → execute); `failTable` makes inserts into that
 * table throw.
 */
function fakeDb(opts: { failTable?: string } = {}) {
  const inserts: RecordedInsert[] = [];
  const db = {
    insertInto(table: string) {
      return {
        values(row: Record<string, unknown>) {
          return {
            async execute() {
              if (table === opts.failTable) {
                throw new Error(`insert into ${table} failed`);
              }
              inserts.push({ table, row });
              return [];
            },
          };
        },
      };
    },
  };
  return { db: db as never, inserts };
}

function logRows(inserts: readonly RecordedInsert[]): Record<string, unknown>[] {
  return inserts.filter((i) => i.table === "user_email_log").map((i) => i.row);
}

describe("sendAndLogUserEmail", () => {
  test("records a sent e-mail once the mail server accepted it", async () => {
    const { db, inserts } = fakeDb();
    let sends = 0;
    await sendAndLogUserEmail({
      db,
      email_type: "password_reset",
      recipient: "jane@example.com",
      uid: UID,
      source: "user_request",
      send: async () => {
        sends++;
      },
    });

    expect(sends).toBe(1);
    const rows = logRows(inserts);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      uid: UID,
      email_type: "password_reset",
      source: "user_request",
      recipient: "jane@example.com",
      status: "sent",
      failure_reason: null,
      requested_by: null,
    });
    expect(typeof rows[0]!.created_at).toBe("number");
  });

  test("records a failed e-mail with its reason and rethrows the send error", async () => {
    const { db, inserts } = fakeDb();
    const error = new MailServerNotConfiguredError("Mail server does not appear to be configured!");
    await expect(
      sendAndLogUserEmail({
        db,
        email_type: "email_verification",
        recipient: "jane@example.com",
        uid: UID,
        source: "admin_request",
        requested_by: ADMIN_UID,
        send: async () => {
          throw error;
        },
      }),
    ).rejects.toBe(error);

    expect(logRows(inserts)).toEqual([
      expect.objectContaining({
        email_type: "email_verification",
        source: "admin_request",
        status: "failed",
        failure_reason: "The mail server is not configured",
        requested_by: ADMIN_UID,
      }),
    ]);
  });

  test("cuts long failure reasons off", async () => {
    const { db, inserts } = fakeDb();
    await expect(
      sendAndLogUserEmail({
        db,
        email_type: "email_verification",
        recipient: "jane@example.com",
        uid: UID,
        source: "registration",
        send: async () => {
          throw new Error("x".repeat(MAX_FAILURE_REASON_LENGTH + 100));
        },
      }),
    ).rejects.toThrow();

    const [row] = logRows(inserts);
    expect((row!.failure_reason as string).length).toBe(MAX_FAILURE_REASON_LENGTH);
  });

  test("a failure to write the log is captured and does not fail the send", async () => {
    const { db, inserts } = fakeDb({ failTable: "user_email_log" });
    await sendAndLogUserEmail({
      db,
      email_type: "password_reset",
      recipient: "jane@example.com",
      uid: UID,
      source: "user_request",
      send: async () => {},
    });

    expect(logRows(inserts)).toEqual([]);
    const captured = inserts.filter((i) => i.table === "errors");
    expect(captured).toHaveLength(1);
    expect(captured[0]!.row.op_name).toBe("sendAndLogUserEmail.recordUserEmailLogEntry");
  });
});
