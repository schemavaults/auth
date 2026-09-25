import { inviteCodeDefinitionSchema, mfaFactorTypeSchema } from "@schemavaults/auth-common";
import { z, withOpenApi } from "@schemavaults/openapi-operations";
import { getAllBrandingAssetKeys, type BrandingAssetKey } from "@/lib/auth-db/branding";
import { userDocumentSchema } from "@/lib/auth-db/users";
import { serverTraceOpCategories, serverTraceSchema } from "@/lib/server-trace-schema";

/**
 * Schemas shared by the "admin" domain operations (`src/app/api/admin/**`).
 * Response shapes mirror what the pre-migration handlers returned; the
 * client hooks (`useAllUsersList`, `useBrandingAssets`, `useUserTokens`,
 * `useServerTraces`) parse exactly these fields.
 */

/** A user row as the administrator user list returns it. */
export const AdminUserRecord = withOpenApi(userDocumentSchema, "AdminUserRecord", {
  description:
    "A registered user as stored by the auth server (not the OIDC `UserData` shape: there is no `sub`, clients derive it from `uid`).",
});

/** `InviteCodeDefinition` from @schemavaults/auth-common, named for the document. */
export const InviteCodeDefinition = withOpenApi(inviteCodeDefinitionSchema, "InviteCodeDefinition");

/** The branding asset slots administrators may customize (`favicon`, `icon`, ...). */
export const brandingAssetKeySchema = z
  .enum(getAllBrandingAssetKeys() as [BrandingAssetKey, ...BrandingAssetKey[]])
  .openapi({ description: "Branding asset slot", example: "favicon" });

/** Metadata of one branding asset slot, with or without a custom upload. */
export const BrandingAssetMetadataRecord = z
  .object({
    key: z.string().openapi({ example: "favicon" }),
    label: z.string().openapi({ example: "Favicon" }),
    description: z.string(),
    allowedContentTypes: z.array(z.string()).readonly().openapi({ example: ["image/png", "image/svg+xml"] }),
    maxSizeBytes: z.number().int().openapi({ description: "Upload limit in raw bytes" }),
    recommendedDimensions: z.string().openapi({ example: "32x32 or 48x48" }),
    hasCustomAsset: z.boolean().openapi({ description: "Whether an administrator uploaded a custom asset for this slot" }),
    contentType: z.string().nullable(),
    contentHash: z.string().nullable().openapi({ description: "SHA-256 hex digest of the uploaded bytes (null when using the default)" }),
    sizeBytes: z.number().nullable(),
    updatedAt: z.number().nullable().openapi({ description: "Unix epoch milliseconds" }),
    updatedBy: z.string().nullable().openapi({ description: "uid of the administrator who uploaded it" }),
  })
  .openapi("BrandingAssetMetadataRecord");

/** Result of a successful branding asset upload. */
export const BrandingAssetUploadResult = z
  .object({
    key: z.string().openapi({ example: "favicon" }),
    contentType: z.string().openapi({ example: "image/png" }),
    contentHash: z.string().openapi({ description: "SHA-256 hex digest of the uploaded bytes" }),
    sizeBytes: z.number().int(),
    updatedAt: z.number().openapi({ description: "Unix epoch milliseconds" }),
  })
  .openapi("BrandingAssetUploadResult");

/** A server trace row (`SERVER_TRACES`) with its timestamps normalized to numbers. */
export const AdminServerTrace = withOpenApi(serverTraceSchema, "AdminServerTrace", {
  description: "A timing trace captured by the server; `start_time` / `end_time` are Unix epoch milliseconds.",
});

/** An operation that recorded server traces, with its trace count in the requested window. */
export const AdminServerTraceOperation = z
  .object({
    op_name: z.string().min(1).openapi({ example: "POST /api/auth/login" }),
    op_category: z.enum(serverTraceOpCategories),
    count: z.number().int().nonnegative().openapi({ description: "Traces recorded for the operation in the window" }),
    last_seen: z.number().nonnegative().openapi({ description: "Start of the operation's most recent trace (Unix epoch milliseconds)" }),
  })
  .openapi("AdminServerTraceOperation");

/** The `since` filter of the server trace endpoints, as the query string carries it. */
export const serverTraceSinceParamSchema = z
  .string()
  .min(1)
  .pipe(z.coerce.number<string>().int().nonnegative())
  .openapi({
    description: "Only traces that started at or after this instant (a non-negative integer Unix epoch in milliseconds).",
    example: "1735689600000",
  });

export const issuedTokenTypeSchema = z
  .enum(["access", "refresh"])
  .openapi({ description: "Kind of issued token" });

/**
 * Unix epoch milliseconds stored in a Postgres BIGINT column: the database
 * driver serializes 64-bit integers as decimal strings, so clients must
 * accept either representation.
 */
const epochMillisecondsColumn = z
  .union([z.number(), z.string()])
  .openapi({ description: "Unix epoch milliseconds (a number, or its decimal string form from the database driver)", example: 1735689600000 });

/** A row of the `ISSUED_TOKENS` audit table. */
export const AdminIssuedToken = z
  .object({
    jti: z.string().openapi({ description: "Token id (`jti` claim)" }),
    uid: z.string(),
    token_type: issuedTokenTypeSchema,
    client_app_id: z.string(),
    audience: z.string().openapi({ description: "API server id or resource URL the token was minted for" }),
    grant_type: z.enum(["refresh_token", "authorization_code", "client_credentials"]),
    issued_at: epochMillisecondsColumn,
    expires_at: epochMillisecondsColumn,
    refresh_jti: z
      .string()
      .nullable()
      .openapi({ description: "For access tokens: the jti of the refresh token minted in the same grant; null otherwise" }),
  })
  .openapi("AdminIssuedToken");

/** The verified MFA factor kinds of a user, as the admin MFA endpoint lists them. */
export const adminMfaFactorTypesSchema = z.array(mfaFactorTypeSchema).readonly();

/** Body of a successful daily admin report run. */
export const DailyAdminReportResult = z
  .object({
    ok: z.literal(true),
    users_count: z.number().int(),
    organizations_count: z.number().int(),
    errors_count: z.number().int(),
    top_most_active_users_count: z.number().int(),
    top_most_popular_apps_count: z.number().int(),
    top_most_popular_apis_count: z.number().int(),
    window_start: z.iso.datetime().openapi({ description: "Start of the 24h reporting window" }),
    window_end: z.iso.datetime().openapi({ description: "End of the 24h reporting window (now)" }),
  })
  .openapi("DailyAdminReportResult");

/** Body of a failed daily admin report run (note: `ok`, not `success`). */
export const DailyAdminReportFailure = z
  .object({ ok: z.literal(false), message: z.string() })
  .openapi("DailyAdminReportFailure");
