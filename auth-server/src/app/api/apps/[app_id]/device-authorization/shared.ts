import { isDynamicallyRegisteredClient, type SchemaVaultsApp } from "@schemavaults/app-definitions";
import { z } from "@schemavaults/openapi-operations";
import type { AppDeviceAuthorizationPolicy } from "@/lib/auth-db/device-authorizations";

export const DEVICE_AUTHORIZATION_POLICY_ROUTE = "/api/apps/[app_id]/device-authorization";

export const AppDeviceAuthorizationPolicyResponse = z
  .object({
    success: z.literal(true),
    available: z.boolean().openapi({
      description:
        "Whether the app can use the grant at all: false for dynamically registered clients, which never can",
    }),
    enabled: z.boolean().openapi({
      description: "Whether the app may start device flows (`POST /api/oidc/device_authorization`) and redeem them",
    }),
    enabled_at: z.number().int().nullable().openapi({ description: "When it was enabled (Unix epoch ms); null when disabled" }),
  })
  .openapi("AppDeviceAuthorizationPolicyResponse");

export const SetAppDeviceAuthorizationPolicyRequest = z
  .object({
    enabled: z.boolean().openapi({
      description:
        "Enable or disable the device authorization grant for the app. Disabling discards the app's device sign-in requests that were not redeemed yet.",
    }),
  })
  .strict()
  .openapi("SetAppDeviceAuthorizationPolicyRequest");

/** The policy as the endpoints report it. */
export function summarizeAppDeviceAuthorizationPolicy(
  app: SchemaVaultsApp,
  policy: AppDeviceAuthorizationPolicy,
): z.infer<typeof AppDeviceAuthorizationPolicyResponse> {
  return {
    success: true,
    available: !isDynamicallyRegisteredClient(app),
    enabled: policy.enabled,
    enabled_at: policy.enabled_at,
  };
}
