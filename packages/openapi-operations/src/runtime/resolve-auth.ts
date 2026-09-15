import type { Context } from "hono";
import type { AuthSchemeDefinition, OperationAuth } from "../auth-scheme";
import type { AnyOperationDefinition, AuthPrincipal } from "../operation";
import { OPERATION_ERROR_CODES, OperationError } from "./errors";

/**
 * Verifies the credential transported by one auth scheme. Returns null when
 * the request carries no credential for the scheme (so the next accepted
 * scheme is tried); throws {@link OperationError} to reject outright (e.g.
 * a credential that IS present but invalid).
 */
export type AuthResolver<TUser = unknown> = (
  c: Context,
  scheme: AuthSchemeDefinition,
) => Promise<AuthPrincipal<TUser> | null> | AuthPrincipal<TUser> | null;

export type AuthResolvers<TUser = unknown> = Readonly<Record<string, AuthResolver<TUser>>>;

export function assertResolversForOperations(
  operations: readonly AnyOperationDefinition[],
  resolvers: AuthResolvers,
): void {
  for (const operation of operations) {
    if (operation.auth.type !== "required") continue;
    for (const scheme of operation.auth.schemes) {
      if (typeof resolvers[scheme.name] !== "function") {
        throw new TypeError(
          `${operation.method.toUpperCase()} ${operation.path} accepts auth scheme "${scheme.name}" but no resolver was registered for it`,
        );
      }
    }
  }
}

function challengeHeader(schemes: readonly AuthSchemeDefinition[]): Record<string, string> {
  const challenges = schemes
    .map((scheme) => scheme.challenge)
    .filter((challenge): challenge is string => typeof challenge === "string");
  return challenges.length > 0 ? { "WWW-Authenticate": challenges.join(", ") } : {};
}

export function grantedScopes(principal: AuthPrincipal): string[] {
  if (typeof principal.scope !== "string") return [];
  return principal.scope.split(" ").filter((scope) => scope.length > 0);
}

export function missingScopes(principal: AuthPrincipal, required: readonly string[]): string[] {
  const granted = new Set(grantedScopes(principal));
  return required.filter((scope) => !granted.has(scope));
}

/**
 * Applies an operation's {@link OperationAuth} to the request: tries each
 * accepted scheme's resolver in order, then enforces the route guard,
 * required scopes, and organization membership. Returns the principal, or
 * null for public operations.
 */
export async function resolveAuth<TUser>(
  c: Context,
  auth: OperationAuth,
  resolvers: AuthResolvers<TUser>,
): Promise<AuthPrincipal<TUser> | null> {
  if (auth.type === "public") return null;

  let principal: AuthPrincipal<TUser> | null = null;
  for (const scheme of auth.schemes) {
    const resolver = resolvers[scheme.name];
    if (!resolver) continue;
    principal = await resolver(c, scheme);
    if (principal) break;
  }
  if (!principal) {
    throw new OperationError(
      401,
      { error: OPERATION_ERROR_CODES.unauthorized, message: "Authentication required" },
      challengeHeader(auth.schemes),
    );
  }

  if ((auth.routeGuard ?? "authenticated") === "admin" && !principal.isAdmin) {
    throw new OperationError(403, {
      error: OPERATION_ERROR_CODES.forbidden,
      message: "Administrator access required",
    });
  }

  const required = auth.requiredScopes ?? [];
  if (required.length > 0) {
    const missing = missingScopes(principal, required);
    if (missing.length > 0) {
      throw new OperationError(
        403,
        {
          error: OPERATION_ERROR_CODES.insufficientScope,
          message: `The presented credential is missing required scope(s): ${missing.join(" ")}`,
          details: { required_scopes: [...required], missing_scopes: missing },
        },
        {
          "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${required.join(" ")}"`,
        },
      );
    }
  }

  if (auth.organization) {
    const { parameter, roles, adminBypass } = auth.organization;
    const organizationId: string | undefined =
      c.req.param(parameter) ?? c.req.query(parameter) ?? undefined;
    if (typeof organizationId !== "string" || organizationId.length === 0) {
      throw new OperationError(400, {
        error: OPERATION_ERROR_CODES.organizationRequired,
        message: `Request parameter "${parameter}" (organization id) is required`,
      });
    }
    const bypass = (adminBypass ?? true) && principal.isAdmin;
    if (!bypass) {
      const role = principal.getOrganizationRole
        ? await principal.getOrganizationRole(organizationId)
        : false;
      const allowed =
        role !== false && (roles.length === 0 || (roles as readonly string[]).includes(role));
      if (!allowed) {
        throw new OperationError(403, {
          error: OPERATION_ERROR_CODES.notMember,
          message:
            roles.length === 0
              ? "You are not a member of this organization"
              : `This operation requires one of the organization roles: ${roles.join(", ")}`,
        });
      }
    }
  }

  return principal;
}
