import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { JwksAccessKeyMetadataResponse, apiServerParams } from "@/lib/api/domain-schemas/apis";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { JwksAccessKeysRegistry, type JwksAccessKeyStatusQueryResponse } from "@/lib/auth-db/jwks-access-keys";
import { JWKS_ACCESS_KEY_AUTH_NOTES, ROUTE, refuseJwksAccessKeyManagement } from "./jwks-access-key-access";

export const getJwksAccessKeyMetadata = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Get JWKS access key metadata",
  description:
    "Reports the active JWKS access key of an API server (id, creation time, active flag) without the key material. `key_metadata` is `false` when no key has been generated yet.",
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes, notes: JWKS_ACCESS_KEY_AUTH_NOTES }),
  request: { params: apiServerParams },
  responses: {
    200: { description: "The key metadata, or `key_metadata: false`", schema: JwksAccessKeyMetadataResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    500: { description: "Failed to verify authorization", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { api_server_id } = ctx.params;

    const refusal = await refuseJwksAccessKeyManagement(db, user, api_server_id, {
      op_name: "GET_jwks_access_key_metadata",
      forbiddenMessage: "You must be a member of the owner organization to view JWKS access keys",
    });
    if (refusal) return ctx.json(refusal.status, { success: false, message: refusal.message });

    // Get key metadata
    const jwksAccessKeysRegistry = new JwksAccessKeysRegistry(db);
    const keyMetadata: JwksAccessKeyStatusQueryResponse | null =
      await jwksAccessKeysRegistry.getKeyMetadata(api_server_id);

    if (!keyMetadata) {
      return ctx.json(200, { success: true, key_metadata: false });
    }
    return ctx.json(200, { success: true, key_metadata: keyMetadata });
  },
});
