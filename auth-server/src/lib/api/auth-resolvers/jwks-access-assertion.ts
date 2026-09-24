import "server-only";
import { apiServerIdSchema } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import {
  OperationError,
  type AuthPrincipal,
  type AuthResolver,
  type HonoContext,
} from "@schemavaults/openapi-operations";
import verifyJwksAccessAssertion from "@/app/api/jwks/[audience]/verifyJwksAccessAssertion";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import type { AuthServerApiContext } from "../context";
import { jwksAccessAssertionScheme } from "../auth-schemes";

/**
 * Where an operation names the API server a JWKS access assertion must have
 * been signed for: the `{audience}` / `{api_server_id}` path parameter, or
 * the `X-Api-Server-Id` header (organization role lookups).
 */
export function jwksAssertionAudience(c: HonoContext): string | null {
  const candidate =
    c.req.param("audience") ?? c.req.param("api_server_id") ?? c.req.header("x-api-server-id");
  const parsed = apiServerIdSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Resolves a resource server's JWKS access assertion (`Authorization: Bearer
 * <assertion>`) to a non-user principal whose `clientId` is the API server
 * id.
 *
 * Status semantics match the pre-migration resource-server routes, which
 * validated the audience before looking at the credential:
 * - an audience that cannot be determined (missing / malformed path
 *   parameter or `X-Api-Server-Id` header) → 400, whether or not an
 *   assertion was sent;
 * - the auth server's own app id → 400: it can never hold a JWKS access key
 *   (its key management endpoints refuse it), so it is never a valid
 *   assertion issuer;
 * - no Authorization header → null (401 from the runtime);
 * - a non-Bearer header, or an assertion that does not verify (malformed,
 *   expired, wrong issuer/audience, no active key, replayed) → 401.
 */
export const jwksAccessAssertionResolver: AuthResolver<UserData, AuthServerApiContext> = async (
  c,
  scheme,
  context,
): Promise<AuthPrincipal<UserData> | null> => {
  const audience = jwksAssertionAudience(c);
  if (!audience) {
    throw new OperationError(400, {
      error: "audience_required",
      message: "The API server the assertion was signed for could not be determined",
    });
  }
  if (audience === getAuthServerAppId()) {
    throw new OperationError(400, {
      error: "invalid_audience",
      message: "The auth server itself is never the audience of a JWKS access assertion",
    });
  }

  const authorization = c.req.header("authorization");
  if (typeof authorization !== "string" || authorization.length === 0) return null;

  const [type, assertion, ...rest] = authorization.split(" ");
  if (type !== "Bearer" || !assertion || rest.length > 0) {
    throw new OperationError(401, {
      error: "invalid_authorization_header",
      message: "Authorization header must be 'Bearer <assertion>'",
    });
  }

  const verified = await verifyJwksAccessAssertion(assertion, audience, context.db);
  if (!verified) {
    throw new OperationError(
      401,
      { error: "invalid_assertion", message: "Invalid or expired JWKS access assertion" },
      { "WWW-Authenticate": jwksAccessAssertionScheme.challenge ?? "Bearer" },
    );
  }

  return { scheme: scheme.name, user: null, isAdmin: false, scope: null, clientId: audience };
};
