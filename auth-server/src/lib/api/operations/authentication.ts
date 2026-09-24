import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { login } from "@/app/api/auth/login/operation";
import { register } from "@/app/api/auth/register/operation";
import { verifyMfaChallenge } from "@/app/api/auth/mfa/verify/operation";
import { webauthnLoginOptions } from "@/app/api/auth/mfa/webauthn/options/operation";
import { logout } from "@/app/api/auth/logout/[client_app_id]/operation";
import { whoami } from "@/app/api/auth/whoami/[client_app_id]/operation";
import { generateAuthorizationCodeOperation } from "@/app/api/auth/session/generate-authorization-code/operation";
import { requestPasswordReset } from "@/app/api/auth/reset-password/request/operation";
import { confirmPasswordReset } from "@/app/api/auth/reset-password/confirm/operation";
import { requestEmailVerification } from "@/app/api/auth/verify-email/request/operation";
import { confirmEmailVerification } from "@/app/api/auth/verify-email/confirm/operation";

/** Operations of the "authentication" domain, in the order they appear in the docs. */
export const authenticationOperations: readonly AnyOperationDefinition[] = [
  login,
  register,
  verifyMfaChallenge,
  webauthnLoginOptions,
  logout,
  whoami,
  generateAuthorizationCodeOperation,
  requestPasswordReset,
  confirmPasswordReset,
  requestEmailVerification,
  confirmEmailVerification,
];
