---
name: mfa
description: Multi-factor authentication in the auth server: TOTP and WebAuthn/passkey modules (`auth-server/src/lib/mfa/`, the `MfaRegistry` resource group), the `mfa_required` login variant completed at `POST /api/auth/mfa/verify`, the `/mfa` account-management UI components, the login challenge components in `@schemavaults/auth-ui`, the `useMfa()` hook, and the required `PRIVATE_MFA_*` env vars. Use when working on MFA enrollment, login challenges, recovery codes, passkeys, or the security settings pages.
---

# Multi-Factor Authentication

TOTP-based MFA lives in `auth-server/src/lib/mfa/` (KEK, recovery-code HMAC, TOTP via `otplib`, QR rendering, Redis challenge store) plus the `MfaRegistry` resource group at `auth-server/src/lib/auth-db/mfa/`. The login handler intercepts users with a verified factor and returns an `mfa_required` discriminated-union variant instead of an authorization code; the client completes the flow at `POST /api/auth/mfa/verify`. Required env vars: `PRIVATE_MFA_SECRET_KEK`, `PRIVATE_MFA_RECOVERY_PEPPER` (both 32-byte base64).

The account-management UI lives in the auth-server `src/components/` (it is consumed only by the auth-server, not by external resource servers) and renders on the dedicated `/mfa` route: `src/components/Mfa/` owns `TotpSettingsCard` plus the TOTP dialogs (`TotpEnrollmentDialog`, `MfaRemoveFactorDialog`, `MfaRegenerateRecoveryCodesDialog`), `src/components/RecoveryCodesPanel/` owns `RecoveryCodesPanel`, and `src/components/Passkeys/` owns `PasskeysSettingsCard`/`PasskeysSettingsSection` (the WebAuthn browser ceremonies). `@schemavaults/auth-ui` retains the login challenge-flow components (`MfaChallengeForm`, `MfaFactorPicker`) used at `/auth/mfa`. The React state hook is `useMfa()` in `@schemavaults/auth-react-provider`.
