import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { JwksAccessKeyGeneratedResponse, apiServerParams } from "@/lib/api/domain-schemas/apis";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { JwksAccessKeysRegistry, type JwksAccessKeyStatusQueryResponse } from "@/lib/auth-db/jwks-access-keys";
import captureServerException from "@/lib/captureServerException";
import { JWKS_ACCESS_KEY_AUTH_NOTES, ROUTE, refuseJwksAccessKeyManagement } from "./jwks-access-key-access";

export const generateJwksAccessKey = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Generate a JWKS access key",
  description:
    "Generates the initial JWKS access key pair of an API server and returns the private key once; the auth server keeps only the public key. Responds 409 when a key already exists (use `PUT` to rotate it). No request body.",
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes, notes: JWKS_ACCESS_KEY_AUTH_NOTES }),
  request: { params: apiServerParams },
  responses: {
    200: { description: "The new key pair; the private key is not retrievable later", schema: JwksAccessKeyGeneratedResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    409: { description: "A JWKS access key already exists for this API server", schema: ErrorResponse },
    500: { description: "Failed to verify authorization or to generate the key", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db } = ctx.context;
    const { api_server_id } = ctx.params;

    const refusal = await refuseJwksAccessKeyManagement(db, user, api_server_id, {
      op_name: "POST_generate_jwks_access_key",
      forbiddenMessage: "You must be a member of the owner organization to manage JWKS access keys",
    });
    if (refusal) return ctx.json(refusal.status, { success: false, message: refusal.message });

    // Check if a key already exists
    const jwksAccessKeysRegistry = new JwksAccessKeysRegistry(db);
    const existingKey: JwksAccessKeyStatusQueryResponse | null =
      await jwksAccessKeysRegistry.getKeyMetadata(api_server_id);
    if (existingKey) {
      return ctx.json(409, {
        success: false,
        message: "A JWKS access key already exists. Use the regenerate endpoint to create a new one.",
      });
    }

    // Generate new key pair
    try {
      const { privateKey, keyId } = await jwksAccessKeysRegistry.generateNewKeyForAudience(api_server_id);
      return ctx.json(200, {
        success: true,
        message:
          "JWKS access key generated successfully. Save the private key securely - it will not be shown again.",
        key_id: keyId,
        private_key: privateKey,
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_generate_jwks_access_key.generateNewKeyForAudience",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to generate JWKS access key" });
    }
  },
});
