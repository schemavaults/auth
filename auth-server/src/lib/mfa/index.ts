export {
  CURRENT_KEK_VERSION,
  encryptSecret,
  decryptSecret,
  type EncryptSecretResult,
} from "./kek";
export { normalizeRecoveryCode, hashRecoveryCode } from "./hash-recovery-code";
export {
  generateRecoveryCodes,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_GROUP_LENGTH,
  RECOVERY_CODE_GROUPS,
} from "./generate-recovery-codes";
export {
  generateTotpSecret,
  buildOtpAuthUrl,
  verifyTotpCode,
  generateTotpCodeForTesting,
  TOTP_ISSUER,
} from "./totp";
export { renderQrPngDataUrl } from "./qr-code";
export {
  createChallenge,
  getChallenge,
  consumeAttempt,
  setWebauthnChallenge,
  deleteChallenge,
  MFA_CHALLENGE_TTL_SECONDS,
  MFA_CHALLENGE_MAX_ATTEMPTS,
  type MfaChallengeState,
} from "./challenge-store";
export {
  putRegChallenge,
  getRegChallenge,
  deleteRegChallenge,
  WEBAUTHN_REG_TTL_SECONDS,
  type WebauthnRegChallengeState,
} from "./webauthn-registration-store";
export {
  putStepUpChallenge,
  getStepUpChallenge,
  deleteStepUpChallenge,
  WEBAUTHN_STEP_UP_TTL_SECONDS,
} from "./webauthn-step-up-store";
export {
  getRpId,
  getExpectedOrigin,
  getRpName,
  generateWebauthnRegistrationOptions,
  verifyWebauthnRegistration,
  generateWebauthnAuthenticationOptions,
  verifyWebauthnAuthentication,
  bytesToBase64Url,
  base64UrlToBytes,
  parseTransports,
  type ExistingCredentialDescriptor,
  type VerifiedWebauthnRegistration,
  type StoredWebauthnCredential,
} from "./webauthn";
export { issueRecoveryCodesIfNeeded } from "./issue-recovery-codes-if-needed";
