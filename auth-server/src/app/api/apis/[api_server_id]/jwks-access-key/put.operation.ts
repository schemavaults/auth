import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { JwksAccessKeyGeneratedResponse, apiServerParams } from "@/lib/api/domain-schemas/apis";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { JwksAccessKeysRegistry } from "@/lib/auth-db/jwks-access-keys";
import captureServerException from "@/lib/captureServerException";
import { JWKS_ACCESS_KEY_AUTH_NOTES, ROUTE, refuseJwksAccessKeyManagement } from "./jwks-access-key-access";

export const regenerateJwksAccessKey = defineOperation({
  method: "put",
  path: ROUTE,
  summary: "Regenerate a JWKS access key",
  description:
    "Rotates an API server's JWKS access key: every previous key is deactivated and a new key pair is created, whose private key is returned once. Works whether or not a key existed before. No request body.",
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes, notes: JWKS_ACCESS_KEY_AUTH_NOTES }),
  request: { params: apiServerParams },
  responses: {
    200: { description: "The new key pair; the private key is not retrievable later", schema: JwksAccessKeyGeneratedResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    500: { description: "Failed to verify authorization or to regenerate the key", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { api_server_id } = ctx.params;

    const refusal = await refuseJwksAccessKeyManagement(db, user, api_server_id, {
      op_name: "PUT_regenerate_jwks_access_key",
      forbiddenMessage: "You must be a member of the owner organization to regenerate JWKS access keys",
    });
    if (refusal) return ctx.json(refusal.status, { success: false, message: refusal.message });

    // Regenerate key (deactivates old keys and creates new one)
    const jwksAccessKeysRegistry = new JwksAccessKeysRegistry(db);
    try {
      const { privateKey, keyId } = await jwksAccessKeysRegistry.regenerateKey(api_server_id);
      return ctx.json(200, {
        success: true,
        message:
          "JWKS access key regenerated successfully. All previous keys have been deactivated. Save the new private key securely - it will not be shown again.",
        key_id: keyId,
        private_key: privateKey,
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "PUT_regenerate_jwks_access_key.regenerateKey",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to regenerate JWKS access key" });
    }
  },
});
