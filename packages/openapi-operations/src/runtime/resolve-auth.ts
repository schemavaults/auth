import type { Context } from "hono";
import { schemeResolvesUser, type AuthSchemeDefinition, type OperationAuth } from "../auth-scheme";
import type { AnyOperationDefinition, AuthPrincipal, UserAuthPrincipal } from "../operation";
import {
  missingFromScope,
  parseScope,
  scopeIncludes,
  scopeValues,
  type ScopeRequirement,
} from "@schemavaults/auth-common/scopes";
import { OPERATION_ERROR_CODES, OperationError } from "./errors";

/**
 * Verifies the credential transported by one auth scheme. Returns null when
 * the request carries no credential for the scheme (so the next accepted
 * scheme is tried); throws {@link OperationError} to reject outright (e.g.
 * a credential that IS present but invalid). Receives the per-request
 * context built by `createOperationsApp({ context })` so it can share the
 * request's database handle / caches with the handler.
 */
export type AuthResolver<TUser = unknown, TContext = unknown> = (
  c: Context,
  scheme: AuthSchemeDefinition,
  context: TContext,
) => Promise<AuthPrincipal<TUser> | null> | AuthPrincipal<TUser> | null;

export type AuthResolvers<TUser = unknown, TContext = unknown> = Readonly<
  Record<string, AuthResolver<TUser, TContext>>
>;

export function assertResolversForOperations(
  operations: readonly AnyOperationDefinition[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolvers: AuthResolvers<any, any>,
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

/**
 * Narrows a principal to one carrying a user, failing closed with a 401
 * when it does not (or when the operation is public and `auth` is null).
 * For handlers whose operations accept schemes without `principal: "user"`
 * but which still need a signed-in user.
 */
export function requireUser<TUser>(
  auth: AuthPrincipal<TUser> | null | undefined,
): TUser {
  if (auth?.user === null || auth?.user === undefined) {
    throw new OperationError(401, {
      error: OPERATION_ERROR_CODES.unauthorized,
      message: "This operation requires a signed-in user",
    });
  }
  return auth.user;
}

function assertUserPrincipal<TUser>(
  scheme: AuthSchemeDefinition,
  principal: AuthPrincipal<TUser>,
): asserts principal is UserAuthPrincipal<TUser> {
  if (schemeResolvesUser(scheme) && (principal.user === null || principal.user === undefined)) {
    throw new OperationError(401, {
      error: OPERATION_ERROR_CODES.unauthorized,
      message: `The credential presented for "${scheme.name}" does not identify a user`,
    });
  }
}

/** The scope values the principal's credential was granted (none without a scope claim). */
export function grantedScopes(principal: AuthPrincipal): string[] {
  return parseScope(principal.scope);
}

/** The values of the `required` scopes the principal was not granted, in order. */
export function missingScopes(
  principal: AuthPrincipal,
  required: readonly ScopeRequirement[],
): string[] {
  return missingFromScope(principal.scope, required);
}

/**
 * Whether the principal was granted every one of the given scopes (values or
 * definitions); false without a principal (public operations). For handlers
 * that do more when a token carries an optional scope:
 *
 * ```ts
 * const notes = hasScopes(ctx.auth, notesScopes.readPrivate) ? all : publicOnly;
 * ```
 */
export function hasScopes(
  principal: AuthPrincipal | null | undefined,
  ...scopes: readonly ScopeRequirement[]
): boolean {
  if (principal === null || principal === undefined) return false;
  return scopeIncludes(principal.scope, ...scopes);
}

/** Whether the principal acts through a delegated credential (it names an RFC 8693 actor). */
export function isDelegatedPrincipal(principal: AuthPrincipal): boolean {
  return principal.actor !== undefined && principal.actor !== null;
}

/**
 * Applies an operation's {@link OperationAuth} to the request: tries each
 * accepted scheme's resolver in order, then enforces the delegated-caller
 * policy, the route guard, required scopes, and organization membership.
 * Returns the principal, or null for public operations.
 */
export async function resolveAuth<TUser, TContext = unknown>(
  c: Context,
  auth: OperationAuth,
  resolvers: AuthResolvers<TUser, TContext>,
  context: TContext = undefined as TContext,
): Promise<AuthPrincipal<TUser> | null> {
  if (auth.type === "public") return null;

  let principal: AuthPrincipal<TUser> | null = null;
  for (const scheme of auth.schemes) {
    const resolver = resolvers[scheme.name];
    if (!resolver) continue;
    principal = await resolver(c, scheme, context);
    if (principal) {
      assertUserPrincipal(scheme, principal);
      break;
    }
  }
  if (!principal) {
    throw new OperationError(
      401,
      { error: OPERATION_ERROR_CODES.unauthorized, message: "Authentication required" },
      challengeHeader(auth.schemes),
    );
  }

  // First of the authorization checks: it is about the kind of credential
  // (the user's own, or one an actor holds for the user), which no role,
  // scope or membership of the user can make up for.
  if (auth.delegatedCallers === "refused" && isDelegatedPrincipal(principal)) {
    throw new OperationError(403, {
      error: OPERATION_ERROR_CODES.delegatedCallerRefused,
      message:
        "This operation does not accept delegated credentials: it must be called with the user's own credential, not one an actor (such as an agent) holds on the user's behalf",
    });
  }

  if ((auth.routeGuard ?? "authenticated") === "admin" && !principal.isAdmin) {
    throw new OperationError(403, {
      error: OPERATION_ERROR_CODES.forbidden,
      message: "Administrator access required",
    });
  }

  const required = scopeValues(auth.requiredScopes);
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
