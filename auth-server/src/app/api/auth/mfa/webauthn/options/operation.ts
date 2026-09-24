import "server-only";
import { toNextRequest } from "@/lib/api/next-request";
import { NextRequest } from "next/server";
import { webauthnAuthenticationOptionsResponseSchema } from "@schemavaults/auth-common";
import { publicAccess, z, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { authRateLimitedResponse, ZodIssuesResponse } from "@/lib/api/domain-schemas/authentication";
import { ErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import handleWebauthnLoginOptions, { webauthnLoginOptionsBodySchema } from "./handle_webauthn_options";

const ROUTE = "/api/auth/mfa/webauthn/options";

export const WebauthnLoginOptionsRequest = withOpenApi(webauthnLoginOptionsBodySchema, "WebauthnLoginOptionsRequest", {
  description:
    "The `challenge_id` from the `mfa_required` login response and the `client_app_id` the login was for. Unknown keys are rejected.",
});

export const WebauthnLoginOptions = withOpenApi(webauthnAuthenticationOptionsResponseSchema, "WebauthnLoginOptions", {
  description:
    "The `PublicKeyCredentialRequestOptionsJSON` to hand to `navigator.credentials.get()` verbatim; `allowCredentials` lists every passkey the user enrolled.",
});

export const webauthnLoginOptions = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Start a passkey assertion for a login MFA challenge",
  description:
    "Issues WebAuthn assertion options for the user behind a pending login MFA challenge and binds the assertion nonce to that challenge, so the signed assertion can be submitted as a `webauthn` proof to `POST /api/auth/mfa/verify`. Refuses users without a verified passkey. Rate limited per IP (shares the MFA verification budget).",
  tags: [API_TAGS.authentication],
  auth: publicAccess("The challenge id issued by `POST /api/auth/login` is the credential."),
  request: {
    body: {
      schema: WebauthnLoginOptionsRequest,
      contentType: "application/json",
      documentOnly: true,
      description: "The body is parsed by the handler itself so its error format stays stable.",
    },
  },
  responses: {
    200: { description: "Assertion options for the user's passkeys", schema: WebauthnLoginOptions },
    400: {
      description:
        "Invalid JSON, a body that fails schema validation (raw zod issues), a challenge issued for another client app, or the client IP could not be determined",
      schema: z.union([ZodIssuesResponse, ErrorResponse]),
    },
    409: { description: "The user has no verified passkey", schema: ErrorResponse },
    410: { description: "The challenge expired or does not exist", schema: ErrorResponse },
    ...authRateLimitedResponse,
    500: { description: "Failed to create the assertion options", schema: ErrorResponse },
  },
  handler: (ctx) => {
    const req: NextRequest =
      ctx.request instanceof NextRequest ? ctx.request : toNextRequest(ctx.request);
    return handleWebauthnLoginOptions(req, ctx.context.redis);
  },
});
