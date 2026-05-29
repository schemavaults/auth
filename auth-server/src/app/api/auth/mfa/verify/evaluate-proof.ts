import "server-only";

import type { MfaProof } from "@schemavaults/auth-common";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { MfaRegistry } from "@/lib/auth-db";
import { verifyTotpCode } from "@/lib/mfa";
import { verifyWebauthnAuthentication } from "@/lib/mfa/webauthn";

// Evaluates an MFA proof against a user's enrolled factors and applies the
// success side-effects (touch last-used, bump WebAuthn counter, consume a
// recovery code). Returns whether the proof was valid. Shared by the login
// second-factor exchange and step-up authorization for sensitive account
// actions so all proof types are verified identically in one place.
//
// For a `webauthn` proof the caller must supply the server-issued assertion
// challenge the authenticator signed (`webauthnChallenge`); if absent the
// proof is rejected.
export async function evaluateMfaProof(args: {
  mfaRegistry: MfaRegistry;
  uid: string;
  proof: MfaProof;
  webauthnChallenge?: string | null;
}): Promise<boolean> {
  const { mfaRegistry, uid, proof } = args;

  if (proof.type === "totp") {
    const factor = await mfaRegistry.getVerifiedFactorById({
      uid,
      factor_id: proof.factor_id,
    });
    if (!factor) return false;
    const valid = verifyTotpCode({ secret: factor.secret, code: proof.code });
    if (valid) {
      await mfaRegistry.touchFactorLastUsed(factor.row.factor_id);
    }
    return valid;
  }

  if (proof.type === "webauthn") {
    if (!args.webauthnChallenge) return false;
    // Resolve the credential by the id the authenticator actually signed
    // with, not the client-supplied factor_id — the allowCredentials list
    // can include several of the user's passkeys and they may use any.
    const assertionId =
      typeof proof.assertion.id === "string" ? proof.assertion.id : "";
    const credential =
      await mfaRegistry.getVerifiedWebauthnCredentialByCredentialId({
        uid,
        credential_id: assertionId,
      });
    if (!credential) return false;
    const result = await verifyWebauthnAuthentication({
      // The auth-common schema validates structure but stays library-version
      // agnostic; @simplewebauthn does the cryptographic verification.
      response: proof.assertion as unknown as AuthenticationResponseJSON,
      expectedChallenge: args.webauthnChallenge,
      credential: {
        credential_id: credential.credential_id,
        public_key: credential.public_key,
        counter: credential.counter,
        transports: credential.transports,
      },
    });
    if (!result || !result.verified) return false;
    await mfaRegistry.updateWebauthnCounter({
      factor_id: credential.factor_id,
      counter: result.newCounter,
    });
    await mfaRegistry.touchFactorLastUsed(credential.factor_id);
    return true;
  }

  // recovery_code
  return await mfaRegistry.consumeRecoveryCode({
    uid,
    code: proof.recovery_code,
  });
}
