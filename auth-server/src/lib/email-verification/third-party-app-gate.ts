import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type Redis from "ioredis";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import requireEmailVerificationForThirdPartyApps from "@/lib/config/require-email-verification-for-third-party-apps";

export const EMAIL_VERIFICATION_REQUIRED_MESSAGE =
  "Please verify your email address before continuing to the requesting application." as const;

export interface EmailVerificationGateInputs {
  db: Kysely<AuthDatabase>;
  redis?: Redis;
  /** The client application an authorization code is about to be minted for. */
  client_app_id: string;
  /** The account's current `USERS.email_verified` (read from the row, not from token claims). */
  email_verified: boolean;
}

/**
 * @name isEmailVerificationRequiredForClientApp
 * @description The single rule behind "never send a user to an external app
 * before they verified their e-mail address". True when an authorization code
 * for `client_app_id` must NOT be minted yet because:
 *  - the app is a third-party client (anything but the auth server's own app
 *    id — the auth server's /account flow stays open to unverified accounts
 *    so the user can manage their account and re-send the verification mail),
 *  - the account's address is not verified, and
 *  - the `require_email_verification_for_third_party_apps` server setting is on.
 *
 * Every code-minting surface (login, registration, the MFA challenge, the
 * session mint behind the consent screen and the already-signed-in authorize
 * bridge) consults this before minting, so the gate holds however the flow
 * reached the mint.
 */
export async function isEmailVerificationRequiredForClientApp({
  db,
  redis,
  client_app_id,
  email_verified,
}: EmailVerificationGateInputs): Promise<boolean> {
  if (client_app_id === getAuthServerAppId()) {
    return false;
  }
  if (email_verified) {
    return false;
  }
  return await requireEmailVerificationForThirdPartyApps(db, redis);
}

export default isEmailVerificationRequiredForClientApp;
