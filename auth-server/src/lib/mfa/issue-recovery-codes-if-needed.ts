import "server-only";

import type { MfaRegistry } from "@/lib/auth-db";
import isValidUuid from "@/lib/is-valid-uuid";
import { generateRecoveryCodes } from "./generate-recovery-codes";

// Recovery codes are an account-wide MFA fallback, issued once when the user
// gains their *first* verified factor. Enrolling an additional factor (e.g. a
// passkey on top of existing TOTP, or vice-versa) must NOT regenerate them —
// doing so would silently invalidate the codes the user already saved.
//
// Shared by both the TOTP and WebAuthn verify-enrollment handlers. Issues a
// fresh set only when the user currently has zero remaining recovery codes;
// otherwise leaves the existing set intact.
export async function issueRecoveryCodesIfNeeded(
  mfaRegistry: MfaRegistry,
  uid: string,
): Promise<{ recovery_codes: string[]; recovery_codes_issued: boolean }> {
  if (!isValidUuid(uid)) {
    throw new TypeError(
      "Cannot issue recovery codes: 'uid' is not a valid UUID",
    );
  }
  const remaining = await mfaRegistry.countRecoveryCodesRemaining(uid);
  if (remaining > 0) {
    return { recovery_codes: [], recovery_codes_issued: false };
  }
  const recovery_codes = generateRecoveryCodes();
  await mfaRegistry.replaceRecoveryCodes({ uid, codes: recovery_codes });
  return { recovery_codes, recovery_codes_issued: true };
}
