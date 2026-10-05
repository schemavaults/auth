import {
  appIdSchema,
  schemaVaultsAppCallbackUrlRefSchema,
  schemaVaultsAppDefinitionSchema,
  schemaVaultsAppDomainRefSchema,
} from "@schemavaults/app-definitions";
import { assignableOrganizationMembershipRoles } from "@schemavaults/auth-common";
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

export const AppAuthorizationRevocationResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    resource_id: z.string().openapi({ description: "The client application id" }),
    was_authorized: z
      .boolean()
      .openapi({ description: "Whether the caller had authorized the app before this request; false means there was nothing to revoke" }),
    revoked_token_count: z
      .number()
      .int()
      .nonnegative()
      .openapi({ description: "How many of the app's unexpired access and refresh tokens issued on the caller's behalf this request revoked; tokens already revoked (e.g. by logout) are not counted" }),
  })
  .openapi("AppAuthorizationRevocationResponse");

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

/**
 * Whether the app's service account is a (virtual) member of the
 * organization that owns the app. Service accounts cannot accept
 * invitations, so this setting is how one joins its organization.
 */
export const AppServiceAccountOrganizationMembership = z
  .object({
    available: z.boolean().openapi({
      description:
        "Whether the app is owned by an organization. Only the service account of an organization-owned app can be a member of an organization (its owner)",
    }),
    organization_id: z.string().nullable().openapi({
      description: "The organization that owns the app, which the service account joins; null when the app is not organization-owned",
      example: "acme",
    }),
    role: z.enum(assignableOrganizationMembershipRoles).nullable().openapi({
      description:
        "The service account's role in that organization, as reported to resource servers' organization membership checks; null when it is not a member",
      example: "member",
    }),
  })
  .openapi("AppServiceAccountOrganizationMembership");

export const AppServiceAccountResponse = z
  .object({
    success: z.literal(true),
    service_account: AppServiceAccountSummary.nullable().openapi({
      description: "Null until the first client_credentials grant (or explicit creation)",
    }),
    has_client_secret: z
      .boolean()
      .openapi({ description: "Whether the app can use the client_credentials grant right now (has a client secret)" }),
    organization_membership: AppServiceAccountOrganizationMembership,
  })
  .openapi("AppServiceAccountResponse");

export const SetAppServiceAccountOrganizationMembershipRequest = z
  .object({
    role: z.enum(assignableOrganizationMembershipRoles).default("member").openapi({
      description: "Role of the service account in the organization that owns the app (default `member`)",
      example: "member",
    }),
  })
  .openapi("SetAppServiceAccountOrganizationMembershipRequest");

export const AppServiceAccountOrganizationMembershipResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    organization_membership: AppServiceAccountOrganizationMembership,
  })
  .openapi("AppServiceAccountOrganizationMembershipResponse");

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
