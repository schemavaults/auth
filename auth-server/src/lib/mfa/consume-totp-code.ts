import "server-only";

import type { MfaRegistry } from "@/lib/auth-db/mfa";
import { matchTotpTimeStep } from "./totp";

/**
 * Verifies a TOTP code from one of the user's factors and consumes it.
 * Returns true only if the code matches the secret within the drift
 * window AND its time step is later than the last step the factor
 * accepted. That step is then recorded, so the same code (or one from an
 * earlier step) is refused from then on, whichever endpoint it is
 * presented to (RFC 6238 §5.2).
 *
 * Every endpoint that accepts a TOTP code must verify it through here:
 * the login MFA challenge and step-up proofs (evaluate-proof.ts),
 * enrollment confirmation, factor removal and recovery code regeneration.
 */
export async function verifyAndConsumeTotpCode(args: {
  mfaRegistry: MfaRegistry;
  uid: string;
  factor_id: string;
  /** The factor's decrypted secret. */
  secret: string;
  code: string;
}): Promise<boolean> {
  const time_step = matchTotpTimeStep({ secret: args.secret, code: args.code });
  if (time_step === null) return false;
  return await args.mfaRegistry.consumeTotpTimeStep({
    uid: args.uid,
    factor_id: args.factor_id,
    time_step,
  });
}
