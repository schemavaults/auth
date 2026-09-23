import {
  appIdSchema,
  schemaVaultsAppCallbackUrlRefSchema,
  schemaVaultsAppDefinitionSchema,
  schemaVaultsAppDomainRefSchema,
} from "@schemavaults/app-definitions";
import { z, withOpenApi } from "@schemavaults/openapi-operations";
import { ErrorResponse } from "@/lib/api/schemas";

/**
 * Schemas shared by the "apps" (client application) operations under
 * `src/app/api/apps/**`.
 */

/** `{app_id}` path parameter of every per-app operation. */
export const appIdParams = z.object({
  app_id: withOpenApi(appIdSchema, { description: "Client application id", example: "my-web-app" }),
});

/**
 * The success variant of `ListAppsQueryResponse` from
 * `@schemavaults/app-definitions`; failures use the `ErrorResponse` envelope.
 */
export const ListAppsQueryResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    list: z.array(schemaVaultsAppDefinitionSchema).readonly(),
  })
  .openapi("ListAppsQueryResponse");

export const ListAppDomainsResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    list: z.array(schemaVaultsAppDomainRefSchema).readonly(),
  })
  .openapi("ListAppDomainsResponse");

export const ListAppCallbackUrlsResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    list: z.array(schemaVaultsAppCallbackUrlRefSchema).readonly(),
  })
  .openapi("ListAppCallbackUrlsResponse");

export const AppAuthorizationStatusResponse = z
  .object({
    success: z.literal(true),
    authorized: z
      .boolean()
      .openapi({ description: "Whether the caller has authorized the app to receive tokens on their behalf" }),
  })
  .openapi("AppAuthorizationStatusResponse");

/** Metadata only: the secret itself is never retrievable after generation. */
export const ClientSecretMetadataResponse = z
  .object({
    success: z.literal(true),
    has_client_secret: z
      .boolean()
      .openapi({ description: "Whether the app currently has a client secret (is a confidential client)" }),
    created_at: z
      .number()
      .optional()
      .openapi({ description: "First-generation time (ms since epoch); absent without a secret" }),
    updated_at: z
      .number()
      .optional()
      .openapi({ description: "Last generation / rotation time (ms since epoch); absent without a secret" }),
  })
  .openapi("ClientSecretMetadataResponse");

export const ClientSecretGenerationResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    client_secret: z
      .string()
      .openapi({ description: "The plaintext client secret: shown once, never retrievable again" }),
  })
  .openapi("ClientSecretGenerationResponse");

/**
 * Public view of an app's service account: the machine identity that
 * `grant_type=client_credentials` tokens are minted for.
 */
export const AppServiceAccountSummary = z
  .object({
    uid: z.string().openapi({ description: "The service account's user id (`sub` / `uid` of its tokens)" }),
    email: z
      .string()
      .openapi({ description: "Synthetic, undeliverable address under the reserved `.invalid` TLD" }),
    created_at: z.number().openapi({ description: "Unix epoch milliseconds" }),
    disabled: z
      .boolean()
      .openapi({ description: "A disabled service account is refused the client_credentials grant" }),
  })
  .openapi("AppServiceAccountSummary");

export const AppServiceAccountResponse = z
  .object({
    success: z.literal(true),
    service_account: AppServiceAccountSummary.nullable().openapi({
      description: "Null until the first client_credentials grant (or explicit creation)",
    }),
    has_client_secret: z
      .boolean()
      .openapi({ description: "Whether the app can use the client_credentials grant right now (has a client secret)" }),
  })
  .openapi("AppServiceAccountResponse");

export const AppServiceAccountCreationResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    service_account: AppServiceAccountSummary,
    created: z.boolean().openapi({ description: "False when the service account already existed" }),
  })
  .openapi("AppServiceAccountCreationResponse");

/**
 * The failures `loadAppForManagement()` (`@/lib/load-app-for-management`)
 * produces before a management handler runs: hardcoded app or no
 * management access (403), unknown app (404), lookup failure (500).
 */
export const appManagementErrorResponses = {
  403: {
    description:
      "The app is hardcoded, or the caller may not manage it (platform administrators, owners / admins of the owning organization, or the owning user only)",
    schema: ErrorResponse,
  },
  404: { description: "No such app", schema: ErrorResponse },
  500: { description: "Failed to load the app or verify authorization", schema: ErrorResponse },
} as const;
