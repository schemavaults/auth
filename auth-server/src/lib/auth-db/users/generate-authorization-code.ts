import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { AppId } from "@schemavaults/app-definitions";
import {
  MAX_AUTHORIZATION_CODE_AGE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";
import { type AuthorizationCodeRecord } from "./authorization-codes-table";

/**
 * OIDC issuance context (only set by the parallel OIDC surface). When
 * present, the code row is flagged `oidc: true` so it can only be
 * redeemed at POST /api/oidc/token, and the nonce/scope are stored for
 * echo into the id_token at redemption.
 */
export interface OidcAuthorizationCodeContext {
  nonce: string | null;
  scope: string;
}

export async function generateAuthorizationCode(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  client_app_id: AppId,
  code_challenge: string,
  code_challenge_method: "S256",
  challenge_time: number,
  redirect_uri: string | null,
  debug: boolean = false,
  oidc: OidcAuthorizationCodeContext | null = null,
): Promise<string> {
  if (debug) {
    console.log(
      "[generateAuthorizationCode] Attempting to generate authorization code...",
    );
  }

  if (code_challenge_method !== "S256") {
    throw new Error("Invalid code challenge method");
  }

  if (typeof challenge_time !== "number") {
    throw new Error("Expected 'challenge_time' to be a number");
  }

  if (debug) {
    console.log(`[generateAuthorizationCode] Generating authorization code for uid: ${uid}`);
  }

  let authorization_code: string;
  try {
    // Use PKCE_ProofKeyManager to generate a random code verifier
    const random_code: string =
      PKCE_ProofKeyManager.createCodeVerifier().code_verifier;
    authorization_code = random_code;
  } catch (e: unknown) {
    console.error("Failed to generate authorization code: ", e);
    throw new Error("Failed to generate authorization code");
  }

  if (debug) {
    console.log(
      `[generateAuthorizationCode] Attempting to insert authorization code "${authorization_code}" for user "${uid}"`,
    );
  }

  // Store the authorization code in the database, with the code_challenge
  try {
    const now: number = Date.now();
    const authorization_code_row: AuthorizationCodeRecord = {
      authorization_code,
      uid,
      client_app_id,
      code_challenge,
      code_challenge_method,
      created_at: now,
      expires_at: now + MAX_AUTHORIZATION_CODE_AGE,
      used_at: null,
      challenge_time,
      redirect_uri,
      nonce: oidc ? oidc.nonce : null,
      scope: oidc ? oidc.scope : null,
      oidc: oidc !== null,
    };

    if (debug) {
      console.log(
        "[generateAuthorizationCode] Attempting to insert authorization code record: ",
        authorization_code_row,
      );
    }

    await db
      .insertInto("authorization_codes")
      .values(authorization_code_row)
      .execute();
  } catch (e: unknown) {
    console.error(e);
    throw new Error("Failed to store authorization code");
  }

  if (debug) {
    console.log(
      `[generateAuthorizationCode] Successfully created and stored authorization code for user with uid: "${uid}"`,
    );
  }

  return authorization_code;
}

export default generateAuthorizationCode;
