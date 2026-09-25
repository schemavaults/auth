import type { ZodObject } from "zod";
import { z } from "../zod-openapi";
import { isPublicOperationAuth } from "../auth-scheme";
import type { AnyOperationDefinition, ResponseDefinition } from "../operation";
import { OperationErrorBodySchema } from "../runtime/error-schema";

/**
 * Responses the operations runtime produces on its own, for the operations
 * that can trigger them:
 *
 * | Status | When |
 * | --- | --- |
 * | 400 | the operation validates params / query / headers / a body, or requires an organization parameter |
 * | 401 | the operation is not public (no, invalid, expired or revoked credential) |
 * | 403 | the operation needs the `admin` route guard, required scopes, or an organization role |
 * | 415 | the operation validates a request body (media type mismatch) |
 * | 500 | always (unexpected failure) |
 *
 * All of them use the {@link OperationErrorBodySchema} envelope. Merged into
 * the document by `buildOpenApiDocument({ documentRuntimeResponses: true })`
 * with the operation's declared responses taking precedence.
 */
export function runtimeErrorResponses(
  operation: AnyOperationDefinition,
): Record<number, ResponseDefinition> {
  const responses: Record<number, ResponseDefinition> = {};
  const { params, query, headers, body } = operation.request;
  const validatesBody = body !== undefined && body.documentOnly !== true;
  const auth = operation.auth;
  const requiresOrganization = !isPublicOperationAuth(auth) && auth.organization !== undefined;

  if (params || query || headers || validatesBody || requiresOrganization) {
    responses[400] = {
      description: requiresOrganization
        ? "The path parameters, query string, headers or body failed validation, or the organization parameter is missing."
        : "The path parameters, query string, headers or body failed validation.",
      schema: OperationErrorBodySchema,
    };
  }

  if (!isPublicOperationAuth(auth)) {
    const challenges = auth.schemes
      .map((scheme) => scheme.challenge)
      .filter((challenge): challenge is string => typeof challenge === "string");
    const unauthorizedHeaders: ZodObject | undefined =
      challenges.length > 0
        ? z.object({
            "WWW-Authenticate": z.string().optional().openapi({
              description: `Challenge for the accepted schemes, e.g. \`${challenges.join(", ")}\`.`,
            }),
          })
        : undefined;
    responses[401] = {
      description:
        "No credential was presented, or the presented credential is invalid, expired or revoked.",
      schema: OperationErrorBodySchema,
      ...(unauthorizedHeaders ? { headers: unauthorizedHeaders } : {}),
    };
    const reasons: string[] = [];
    if ((auth.routeGuard ?? "authenticated") === "admin") reasons.push("is not a platform administrator");
    if ((auth.requiredScopes?.length ?? 0) > 0) reasons.push("presented a token missing a required scope");
    if (auth.organization) reasons.push("lacks the required organization role");
    if (reasons.length > 0) {
      responses[403] = {
        description: `The caller is authenticated but ${reasons.join(", or ")}.`,
        schema: OperationErrorBodySchema,
      };
    }
  }

  if (validatesBody) {
    responses[415] = {
      description: `The request body is not \`${body.contentType ?? "application/json"}\`.`,
      schema: OperationErrorBodySchema,
    };
  }

  responses[500] = {
    description: "Unexpected server error.",
    schema: OperationErrorBodySchema,
  };
  return responses;
}

/**
 * Copy of the operation whose `responses` also list the
 * {@link runtimeErrorResponses}; a response the operation declares itself
 * wins over the runtime's for the same status. For document generation
 * only: serve the original operation.
 */
export function withRuntimeErrorResponses(operation: AnyOperationDefinition): AnyOperationDefinition {
  return Object.freeze({
    ...operation,
    responses: { ...runtimeErrorResponses(operation), ...operation.responses },
  });
}
