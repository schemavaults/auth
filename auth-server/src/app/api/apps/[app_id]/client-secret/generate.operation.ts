import type { AppId } from "@schemavaults/app-definitions";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation, type AuthServerApiContext } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  ClientSecretGenerationResponse,
  appIdParams,
  appManagementErrorResponses,
} from "@/lib/api/domain-schemas/apps";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import type { UserData } from "@schemavaults/auth-common";
import captureServerException from "@/lib/captureServerException";
import loadAppForManagement from "@/lib/load-app-for-management";
import { generateClientSecret, hashClientSecret } from "@/lib/oauth2/client-secret";
import { CLIENT_SECRET_ROUTE } from "./client-secret-route";

type GenerationResponseBody =
  | { success: true; message: string; client_secret: string }
  | { success: false; message: string };

type GenerationOutcome =
  | { status: 200; body: Extract<GenerationResponseBody, { success: true }> }
  | { status: 409 | 500; body: Extract<GenerationResponseBody, { success: false }> }
  | { status: "guard"; response: Response };

const responses = {
  200: { description: "The new plaintext client secret (shown once)", schema: ClientSecretGenerationResponse },
  ...validationErrorResponse,
  ...sessionErrorResponses,
  ...appManagementErrorResponses,
  409: { description: "The app already has a client secret (POST only); rotate it instead", schema: ErrorResponse },
} as const;

async function generateAndStoreSecret(
  context: AuthServerApiContext,
  user: UserData,
  app_id: AppId,
  mode: "create" | "rotate",
): Promise<GenerationOutcome> {
  const { db, dbh } = context;
  const op_name = mode === "create" ? "POST_generate_client_secret" : "PUT_rotate_client_secret";

  const guard = await loadAppForManagement({ app_id, user, dbh, route: CLIENT_SECRET_ROUTE, op_name });
  if (!guard.ok) return { status: "guard", response: guard.response };

  try {
    const appRegistry = new SchemaVaultsAppRegistry(db);
    const existing = await appRegistry.getClientSecretRecord(app_id);
    if (mode === "create" && existing) {
      return {
        status: 409,
        body: { success: false, message: "This app already has a client secret. Use rotation to replace it." },
      };
    }

    const client_secret: string = generateClientSecret();
    await appRegistry.setClientSecret(app_id, hashClientSecret(client_secret), user.uid);

    const message: string =
      mode === "create"
        ? "Client secret generated successfully. Save it securely - it will not be shown again."
        : "Client secret rotated successfully. The previous secret no longer works. Save the new secret securely - it will not be shown again.";
    return { status: 200, body: { success: true, message, client_secret } };
  } catch (e: unknown) {
    await captureServerException(db, e, {
      op_name: `${op_name}.setClientSecret`,
      route: CLIENT_SECRET_ROUTE,
      uid: user.uid,
      context: { app_id },
    });
    return { status: 500, body: { success: false, message: "Failed to generate client secret" } };
  }
}

export const generateClientSecretOperation = defineOperation({
  method: "post",
  path: "/api/apps/{app_id}/client-secret",
  summary: "Generate a client secret",
  description:
    "Generates a client secret for a client application that has none, making it a confidential OAuth2 / OIDC client. Returns the plaintext secret exactly once. Requires management access; hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses,
  handler: async (ctx) => {
    const outcome = await generateAndStoreSecret(ctx.context, ctx.auth.user, ctx.params.app_id, "create");
    if (outcome.status === "guard") return outcome.response;
    return outcome.status === 200 ? ctx.json(200, outcome.body) : ctx.json(outcome.status, outcome.body);
  },
});

export const rotateClientSecret = defineOperation({
  method: "put",
  path: "/api/apps/{app_id}/client-secret",
  summary: "Rotate a client secret",
  description:
    "Rotates (or creates) the client secret of a client application on demand. The previous secret is invalidated immediately. Returns the new plaintext secret exactly once. Requires management access; hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses,
  handler: async (ctx) => {
    const outcome = await generateAndStoreSecret(ctx.context, ctx.auth.user, ctx.params.app_id, "rotate");
    if (outcome.status === "guard") return outcome.response;
    return outcome.status === 200 ? ctx.json(200, outcome.body) : ctx.json(outcome.status, outcome.body);
  },
});
