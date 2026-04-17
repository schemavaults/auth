import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { AppId } from "@schemavaults/app-definitions";
import { PKCE_ProofKeyManager } from "@schemavaults/auth-common";
import { authorizationCodeRecordSchema } from "./authorization-codes-table";

/**
 * Atomically validates an OAuth2 PKCE authorization code and marks it
 * consumed in a single database transaction.
 *
 * Behavior:
 *  - The code must exist, have `used_at IS NULL`, and not yet be expired.
 *  - The code's stored `client_app_id` must equal the supplied
 *    `client_app_id`. This binds a code to the client application it
 *    was issued for (defense-in-depth: a code issued for App A cannot
 *    be redeemed at App B's token endpoint).
 *  - The supplied `code_verifier` is compared (timing-safe) against the
 *    stored SHA-256 `code_challenge`.
 *  - On success, the row's `used_at` is set via a conditional UPDATE
 *    guarded by `used_at IS NULL AND expires_at > now`. If that UPDATE
 *    matches zero rows (a concurrent request won the race), the request
 *    is rejected.
 *  - On invalid verifier or mismatched `client_app_id` the code is NOT
 *    consumed, so a legitimate client may retry with the correct
 *    values. This is safe because the authorization code itself is
 *    already a long random secret.
 *
 * Returns `{ uid }` on successful validation & consumption, `null` for
 * every invalid-input case (not found, expired, already consumed, bad
 * verifier, client_app_id mismatch, lost race). Throws only on
 * infrastructure / parse errors.
 */
export async function validateAndConsumeAuthorizationCode(
  db: Kysely<AuthDatabase>,
  authorization_code: string,
  client_app_id: AppId,
  code_verifier: string,
  challenge_time: number,
  debug: boolean = false,
): Promise<{ uid: string } | null> {
  if (debug) {
    console.log(
      "[validateAndConsumeAuthorizationCode] Validating authorization code...",
    );
  }

  return await db.transaction().execute(async (trx) => {
    // 1. Look up an UNUSED row by code.
    const row = await trx
      .selectFrom("authorization_codes")
      .where("authorization_code", "=", authorization_code)
      .where("used_at", "is", null)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      if (debug) {
        console.warn(
          "[validateAndConsumeAuthorizationCode] Authorization code not found or already consumed",
        );
      }
      return null;
    }

    // 2. Parse the row with the zod schema. BIGINT columns arrive as
    // either `number` or numeric `string` from different drivers, so
    // normalize to numbers for every numeric field.
    const parsed_authorization_code =
      await authorizationCodeRecordSchema.safeParseAsync({
        ...row,
        created_at:
          typeof row.created_at === "number"
            ? row.created_at
            : parseInt(row.created_at as unknown as string),
        challenge_time:
          typeof row.challenge_time === "number"
            ? row.challenge_time
            : parseInt(row.challenge_time as unknown as string),
        expires_at:
          typeof row.expires_at === "number"
            ? row.expires_at
            : parseInt(row.expires_at as unknown as string),
        used_at:
          row.used_at === null || row.used_at === undefined
            ? null
            : typeof row.used_at === "number"
              ? row.used_at
              : parseInt(row.used_at as unknown as string),
      });
    if (!parsed_authorization_code.success) {
      console.error(
        "[validateAndConsumeAuthorizationCode] Failed to parse authorization code from database",
        parsed_authorization_code.error.errors,
      );
      throw new Error("Failed to parse authorization code from database");
    }
    const {
      code_challenge: code_challenge_from_database,
      uid,
      client_app_id: stored_client_app_id,
      expires_at,
    } = parsed_authorization_code.data;

    // 3. Defense-in-depth: the code must be redeemed by the same client
    // application it was issued for. Rejecting here (before the atomic
    // consume UPDATE) preserves the code for a legitimate retry; a
    // malicious mismatched exchange cannot burn a user's in-flight code.
    if (stored_client_app_id !== client_app_id) {
      if (debug) {
        console.warn(
          `[validateAndConsumeAuthorizationCode] client_app_id mismatch: code was issued for "${stored_client_app_id}", redeem attempted as "${client_app_id}"`,
        );
      }
      return null;
    }

    // 4. Expiry check.
    const now: number = Date.now();
    if (expires_at <= now) {
      if (debug) {
        console.warn(
          "[validateAndConsumeAuthorizationCode] Authorization code is expired",
        );
      }
      return null;
    }

    // 4. Validate the code_verifier format before any crypto work.
    let unverified_user_code_verifier: string;
    try {
      const codeVerifierSchema = PKCE_ProofKeyManager.codeVerifierSchema;
      const parsed = codeVerifierSchema.safeParse(code_verifier);
      if (!parsed.success) {
        if (debug) {
          console.warn(
            "[validateAndConsumeAuthorizationCode] Invalid code verifier format",
            parsed.error,
          );
        }
        return null;
      }
      unverified_user_code_verifier = parsed.data;
    } catch (e: unknown) {
      console.error(
        "[validateAndConsumeAuthorizationCode] Unexpected error parsing code_verifier",
        e,
      );
      return null;
    }

    // 5. PKCE match (timing-safe).
    let isValid: boolean = false;
    try {
      isValid = await PKCE_ProofKeyManager.doesVerifierMatchChallenge({
        input_code_verifier: unverified_user_code_verifier,
        saved_code_challenge: code_challenge_from_database,
        challenge_time,
        timingSafeEqual,
      });
    } catch (e: unknown) {
      console.error(
        "[validateAndConsumeAuthorizationCode] Failed to hash code verifier",
        e,
      );
      throw new Error("Failed to hash code verifier");
    }

    if (!isValid) {
      if (debug) {
        console.warn(
          "[validateAndConsumeAuthorizationCode] code_verifier does not match stored code_challenge",
        );
      }
      return null;
    }

    // 6. Atomically mark consumed. The conditional UPDATE is the
    // single-source-of-truth for single-use: if a concurrent request
    // consumed the row between our SELECT and our UPDATE, this returns
    // 0 affected rows and we reject.
    const updateResult = await trx
      .updateTable("authorization_codes")
      .set({ used_at: now })
      .where("authorization_code", "=", authorization_code)
      .where("used_at", "is", null)
      .where("expires_at", ">", now)
      .executeTakeFirst();

    if (!updateResult || updateResult.numUpdatedRows === BigInt(0)) {
      if (debug) {
        console.warn(
          "[validateAndConsumeAuthorizationCode] Lost race to consume authorization code",
        );
      }
      return null;
    }

    if (debug) {
      console.log(
        "[validateAndConsumeAuthorizationCode] Authorization code validated and consumed",
      );
    }
    return { uid };
  });
}

export default validateAndConsumeAuthorizationCode;
