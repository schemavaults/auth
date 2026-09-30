import { describe, expect, test } from "bun:test";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import { removeAppAuthorizationForUser } from "./remove-app-authorization-for-user";

const UID = "55555555-5555-4555-8555-555555555555";
const APP_ID = "e2e-third-party-app";

/** Records the DELETE (deleteFrom → where… → executeTakeFirst). */
function fakeDb(numDeletedRows: number) {
  const deletes: { table: string; where: unknown[][] }[] = [];
  const db = {
    deleteFrom(table: string) {
      const del = { table, where: [] as unknown[][] };
      deletes.push(del);
      const builder = {
        where(...args: unknown[]) {
          del.where.push(args);
          return builder;
        },
        async executeTakeFirst() {
          return { numDeletedRows: BigInt(numDeletedRows) };
        },
      };
      return builder;
    },
  };
  return { db: db as never, deletes };
}

describe("removeAppAuthorizationForUser", () => {
  test("deletes the user's authorization row and reports that it existed", async () => {
    const fake = fakeDb(1);
    expect(await removeAppAuthorizationForUser(fake.db, UID, APP_ID)).toBe(true);
    expect(fake.deletes).toEqual([
      {
        table: "authorized_apps",
        where: [
          ["uid", "=", UID],
          ["app_id", "=", APP_ID],
        ],
      },
    ]);
  });

  test("reports false when the app was not authorized", async () => {
    expect(await removeAppAuthorizationForUser(fakeDb(0).db, UID, APP_ID)).toBe(false);
  });

  test("refuses to de-authorize the auth server's own app", async () => {
    const fake = fakeDb(1);
    await expect(removeAppAuthorizationForUser(fake.db, UID, getAuthServerAppId())).rejects.toThrow(
      "always authorized",
    );
    expect(fake.deletes).toEqual([]);
  });
});
