import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";
import { UserNotFoundError } from "./set-user-disabled";
import { getHardcodedOrgs, type OrganizationID } from "@schemavaults/auth-common";

export interface DeleteUserResult {
  deleted_uid: string;
  /**
   * Organizations that were deleted alongside the user because the user
   * was their only remaining member. Deleting these rows cascades to the
   * org's apps, API servers, domains, JWKS access keys, app-to-API
   * permissions, memberships, and invitations.
   */
  deleted_organizations: readonly OrganizationID[];
}

/**
 * Permanently deletes a user and everything the user owns, in a single
 * transaction.
 *
 * Most per-user rows are removed by the database itself via
 * ON DELETE CASCADE foreign keys on USERS(uid): passwords, authorization
 * codes, password-reset + email-verification tokens, org membership
 * roles, org invitations (as inviter or invitee), authorized apps,
 * issued-token records, token revocations, MFA factors, WebAuthn
 * credentials, and MFA recovery codes. Audit-style references
 * (SERVER_SETTINGS.updated_by, SERVER_BRANDING_ASSETS.updated_by,
 * app-to-API permission created_by, ORGANIZATIONS.created_by,
 * INVITE_CODES.created_by) are set to NULL by their FKs instead, and
 * ERRORS.uid is intentionally unconstrained so error logs survive.
 *
 * The only cleanup the database cannot decide on its own is what to do
 * with organizations the user leaves behind: organizations where the
 * user was the sole member are deleted here (cascading to their apps and
 * API servers), while organizations with other members are kept intact —
 * only the user's membership rows disappear.
 *
 * The deleted uid is tombstoned in DELETED_USER_UIDS (same transaction)
 * so it can never be reassigned to a new user — third-party resource
 * servers may retain data keyed by the uid, and re-issuing it would leak
 * that data to the new owner.
 *
 * Note that already-issued access tokens are stateless JWTs and remain
 * verifiable until they expire; refresh grants fail immediately once the
 * user row is gone.
 *
 * @throws {UserNotFoundError} when no user exists with the given uid.
 */
export async function deleteUser(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  debug: boolean = false,
): Promise<DeleteUserResult> {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid user UUID to delete!");
  }

  if (debug) {
    console.log(`[deleteUser] deleteUser(uid = "${uid}")`);
  }

  // Virtual system organizations never live in the ORGANIZATIONS table,
  // but filter them defensively so a delete can never target one.
  const hardcodedOrgIds: ReadonlySet<string> = new Set(
    getHardcodedOrgs().map((org) => org.organization_id),
  );

  const runDelete = async (
    trx: Transaction<AuthDatabase>,
  ): Promise<DeleteUserResult> => {
      const existingUser = await trx
        .selectFrom("users")
        .select("uid")
        .where("uid", "=", uid)
        .executeTakeFirst();
      if (!existingUser) {
        throw new UserNotFoundError(uid);
      }

      const membershipOrgRows = await trx
        .selectFrom("organization_membership_roles")
        .select("organization_id")
        .distinct()
        .where("uid", "=", uid)
        .execute();
      const membershipOrgIds: readonly OrganizationID[] =
        membershipOrgRows.map((row) => row.organization_id);

      let orgsToDelete: readonly OrganizationID[] = [];
      if (membershipOrgIds.length > 0) {
        const orgsWithOtherMembersRows = await trx
          .selectFrom("organization_membership_roles")
          .select("organization_id")
          .distinct()
          .where("organization_id", "in", [...membershipOrgIds])
          .where("uid", "!=", uid)
          .execute();
        const orgsWithOtherMembers: ReadonlySet<string> = new Set(
          orgsWithOtherMembersRows.map((row) => row.organization_id),
        );
        orgsToDelete = membershipOrgIds.filter(
          (organization_id) =>
            !orgsWithOtherMembers.has(organization_id) &&
            !hardcodedOrgIds.has(organization_id),
        );
      }

      if (orgsToDelete.length > 0) {
        await trx
          .deleteFrom("organizations")
          .where("organization_id", "in", [...orgsToDelete])
          .execute();
      }

      const deleteResult = await trx
        .deleteFrom("users")
        .where("uid", "=", uid)
        .executeTakeFirst();
      const numDeletedRows: number = Number(deleteResult.numDeletedRows);
      if (numDeletedRows !== 1) {
        throw new Error(
          `Expected exactly one user row to be deleted, but '${numDeletedRows}' rows were deleted!`,
        );
      }

      // Permanently reserve the uid: third-party resource servers may
      // still hold data keyed by it, so it must never be assigned to a
      // new user (enforced by the users_prevent_deleted_uid_reuse
      // trigger; createUser also pre-checks this table).
      await trx
        .insertInto("deleted_user_uids")
        .values({ uid, deleted_at: Date.now() })
        .onConflict((oc) => oc.column("uid").doNothing())
        .execute();

      return {
        deleted_uid: uid,
        deleted_organizations: orgsToDelete,
      };
  };

  // Kysely does not support nested transactions — calling .transaction()
  // on a Transaction throws — so join an already-open transaction instead
  // of starting a new one. (Callers passing a Transaction get atomicity
  // from their own enclosing transaction.) isTransaction === true
  // guarantees the handle is a Transaction at runtime; TypeScript just
  // can't narrow the union from a boolean property, hence the cast.
  const result: DeleteUserResult = db.isTransaction
    ? await runDelete(db as Transaction<AuthDatabase>)
    : await db.transaction().execute(runDelete);

  if (debug) {
    console.log(
      `[deleteUser] deleteUser(uid = "${uid}") = Success! (deleted_organizations = ${JSON.stringify(
        result.deleted_organizations,
      )})`,
    );
  }

  return result;
}

export default deleteUser;
