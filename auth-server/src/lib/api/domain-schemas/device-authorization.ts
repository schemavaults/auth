import {
  MAX_USER_CODE_INPUT_LENGTH,
  appConsentStatusSchema,
  approvedApiScopesSchema,
} from "@schemavaults/auth-common";
import { appIdSchema } from "@schemavaults/app-definitions";
import { z, withOpenApi } from "@schemavaults/openapi-operations";

/** Machine-readable reasons the `/api/auth/device/*` endpoints refuse a code. */
export const DEVICE_VERIFICATION_ERROR_IDS = [
  "invalid_user_code",
  "email_verification_required",
] as const;

export type DeviceVerificationErrorId = (typeof DEVICE_VERIFICATION_ERROR_IDS)[number];

const userCodeField = z.string().min(1).max(MAX_USER_CODE_INPUT_LENGTH).openapi({
  description:
    "The user code shown on the device, as the user typed it: case-insensitive, dashes and spaces ignored.",
  example: "BCDF-GHJK",
});

export const DeviceUserCodeRequest = z
  .object({ user_code: userCodeField })
  .strict()
  .openapi("DeviceUserCodeRequest");

export const ApproveDeviceAuthorizationRequest = z
  .object({
    user_code: userCodeField,
    approved_api_scopes: approvedApiScopesSchema.optional().openapi({
      description:
        "The API scopes the user left ticked. Recorded as the user's consent for those of them the request asks for and the app may be granted; the rest are not granted. Omitted or empty: no API scope is consented to now (OIDC scopes and API scopes consented to before are still granted).",
    }),
  })
  .strict()
  .openapi("ApproveDeviceAuthorizationRequest");

export const DeviceAuthorizationDescription = z
  .object({
    success: z.literal(true),
    user_code: z.string().openapi({ description: "The user code, formatted for display", example: "BCDF-GHJK" }),
    client_app: z.object({
      app_id: appIdSchema,
      app_name: z.string().openapi({ description: "Typed in by the app's developers; not verified" }),
      app_description: z.string().openapi({ description: "Typed in by the app's developers; not verified" }),
    }),
    created_at: z.number().int().openapi({ description: "When the device asked (Unix epoch ms)" }),
    expires_at: z.number().int().openapi({ description: "When the request expires (Unix epoch ms)" }),
    consent: withOpenApi(appConsentStatusSchema, {
      description: "What the request asks for, as on the consent screen of a browser sign-in",
    }),
  })
  .openapi("DeviceAuthorizationDescription");

export const DeviceAuthorizationDecisionResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    decision: z.enum(["approved", "denied"]),
    client_app_id: appIdSchema,
    scope: z.string().nullable().optional().openapi({
      description: "On approval: the granted scope (null for a plain OAuth 2.1 grant)",
    }),
  })
  .openapi("DeviceAuthorizationDecisionResponse");

export const DeviceVerificationErrorResponse = z
  .object({
    success: z.literal(false),
    message: z.string(),
    error_id: z.enum(DEVICE_VERIFICATION_ERROR_IDS),
  })
  .openapi("DeviceVerificationErrorResponse");
