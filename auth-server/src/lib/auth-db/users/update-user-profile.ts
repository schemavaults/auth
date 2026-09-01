import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import {
  updateUserProfileRequestSchema,
  type UpdateUserProfileRequest,
} from "@schemavaults/auth-common";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";
import { UserNotFoundError } from "./set-user-disabled";
import { getUserByUID } from "./get-user-by-uid";
import type { UserDocument } from "./parse-user-document";

/**
 * Thrown when the requested username is already claimed by another
 * account (usernames are unique case-insensitively — see migration
 * 00036's users_username_lower_unique index). API routes map this to a
 * 409 Conflict.
 */
export class UsernameTakenError extends Error {
  public constructor(username: string) {
    super(`The username '${username}' is already taken!`);
    this.name = "UsernameTakenError";
  }
}

/**
 * Postgres signals a unique-constraint violation with SQLSTATE 23505.
 * The error surface differs between the direct `pg` Pool adapter and
 * the Neon-compatible WebSocket proxy, so match the code where present
 * and fall back to the violated index's name in the message.
 */
function isUsernameUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = (e as { code?: unknown }).code;
  const message = (e as { message?: unknown }).message;
  const mentionsUsernameIndex: boolean =
    typeof message === "string" &&
    message.includes("users_username_lower_unique");
  return code === "23505" ? true : mentionsUsernameIndex;
}

/**
 * Replaces the user-editable profile name fields on a USERS row.
 * Full-replacement semantics: every omitted (or null) field is cleared.
 * Values are validated against the shared
 * {@link updateUserProfileRequestSchema} before touching the database.
 *
 * @throws {UserNotFoundError} when no user exists with the given uid.
 * @throws {UsernameTakenError} when the username is claimed by another
 *   account (case-insensitively).
 * @returns The updated user document.
 */
export async function updateUserProfile(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  profile: UpdateUserProfileRequest,
  debug: boolean = false,
): Promise<UserDocument> {
  if (!isValidUuid(uid)) {
    throw new Error("Invalid user UUID to update profile for!");
  }

  const parsed = await updateUserProfileRequestSchema.safeParseAsync(profile);
  if (!parsed.success) {
    if (debug) {
      console.error("[updateUserProfile]", parsed.error.errors);
    }
    throw new TypeError("Received invalid user profile fields!");
  }

  if (debug) {
    console.log(`[updateUserProfile] Updating profile for uid '${uid}'`);
  }

  try {
    const updateResult = await db
      .updateTable("users")
      .set({
        username: parsed.data.username ?? null,
        first_name: parsed.data.first_name ?? null,
        middle_name: parsed.data.middle_name ?? null,
        last_name: parsed.data.last_name ?? null,
        display_name: parsed.data.display_name ?? null,
      })
      .where("uid", "=", uid)
      .executeTakeFirst();

    const numRowsUpdated: number = Number(updateResult?.numUpdatedRows ?? 0);
    if (numRowsUpdated === 0) {
      throw new UserNotFoundError(uid);
    }
    if (numRowsUpdated !== 1) {
      throw new Error(
        `Expected exactly one row to be modified by updateUserProfile, but '${numRowsUpdated}' rows were updated!`,
      );
    }
  } catch (e: unknown) {
    if (e instanceof UserNotFoundError) {
      throw e;
    }
    if (isUsernameUniqueViolation(e)) {
      throw new UsernameTakenError(parsed.data.username ?? "");
    }
    console.error(`Failed to update profile for user '${uid}': `, e);
    throw new Error(`Failed to update profile for user '${uid}'!`);
  }

  const updated: UserDocument | null = await getUserByUID(db, uid, debug);
  if (!updated) {
    throw new UserNotFoundError(uid);
  }

  if (debug) {
    console.log(
      `[updateUserProfile] Updated profile for uid '${uid}' successfully!`,
    );
  }

  return updated;
}

export default updateUserProfile;
