import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { PKCE_ProofKeyManager } from "@schemavaults/auth-common";
import { authorizationCodeRecordSchema } from "./authorization-codes-table";

export async function validateAuthorizationCode(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  authorization_code: string,
  code_verifier: string,
  challenge_time: number,
  debug: boolean = false
): Promise<{ uid: string } | null> {
  if (debug) {
    console.log("[validateAuthorizationCode] Validating authorization code...");
  }

  let code_challenge_from_database: string;
  let uid: string;
  try {
    const rows = await db
      .selectFrom("authorization_codes")
      .where("authorization_code", "=", authorization_code)
      .selectAll()
      .execute();
    if (rows.length === 0) {
      if (debug) {
        console.error(
          "[validateAuthorizationCode] Authorization code row not found in database..",
        );
      }
      throw new Error("Authorization code not found");
    } else if (rows.length > 1) {
      if (debug) {
        console.error(
          "[validateAuthorizationCode] Multiple authorization codes found in database: ",
          rows,
        );
      }
      throw new Error(
        "Multiple authorization codes found with the same code",
      );
    }
    console.assert(
      rows.length === 1,
      "Expected exactly 1 authorization code row to have been received from the database if this point was reached!",
    );
    const row = rows[0]!;

    if (debug) {
      console.log(
        "[validateAuthorizationCode] Found authorization code row in database! Parsing...",
      );
    }

    const parsed_authorization_code =
      await authorizationCodeRecordSchema.safeParseAsync({
        ...row,
        created_at:
          typeof row.created_at === "number"
            ? row.created_at
            : parseInt(row.created_at),
        challenge_time:
          typeof row.challenge_time === "number"
            ? row.challenge_time
            : parseInt(row.challenge_time),
      });
    if (!parsed_authorization_code.success) {
      console.error(parsed_authorization_code.error.errors);
      throw new Error("Failed to parse authorization code from database");
    }
    code_challenge_from_database =
      parsed_authorization_code.data.code_challenge;
    uid = parsed_authorization_code.data.uid;
  } catch (e: unknown) {
    console.error("Failed to validate authorization code: ", e);
    throw new Error("Failed to validate authorization code");
  }

  if (debug) {
    console.log(
      "[validateAuthorizationCode] Successfully parsed authorization code record!",
    );
  }

  // Code verifier to be hashed with SHA-256
  let unverified_user_code_verifier: string;
  try {
    const codeVerifierSchema = PKCE_ProofKeyManager.codeVerifierSchema;
    const parsed = codeVerifierSchema.safeParse(code_verifier);
    if (!parsed.success) {
      if (debug) {
        console.error("[validateAuthorizationCode] Invalid code verifier", parsed.error);
      }
      throw parsed.error;
    }
    unverified_user_code_verifier = parsed.data;
  } catch (e: unknown) {
    console.error(
      "User supplied a code verifier that does not meet format standard: ",
      e,
    );
    throw new Error(
      "User supplied a code verifier that does not meet format standard!",
    );
  }

  let isValid: boolean = false;
  try {
    isValid = await PKCE_ProofKeyManager.doesVerifierMatchChallenge({
      input_code_verifier: unverified_user_code_verifier,
      saved_code_challenge: code_challenge_from_database,
      challenge_time,
    });
  } catch (e: unknown) {
    console.error(
      "Failed to hash code verifier, does not appear to match stored code_challenge: ",
      e,
    );
    throw new Error("Failed to hash code verifier");
  }

  if (!isValid) {
    throw new Error("Invalid code verifier");
  }

  return { uid };
}

export default validateAuthorizationCode;
