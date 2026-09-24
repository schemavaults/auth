import "server-only";
import type { PotentiallyValidTokenSource, UserData } from "@schemavaults/auth-common";
import type { IRouteGuard } from "@schemavaults/auth-server-sdk";
import { OperationError, type AuthPrincipal } from "@schemavaults/openapi-operations";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import isUserInOrganization from "@/lib/isUserInOrganization";
import RouteGuardFactory from "@/lib/RouteGuardFactory";
import type { AuthServerApiContext } from "../context";

/**
 * Verifies one candidate token with the auth server's own route guard
 * factory (local keyset store + revocation check) and turns the result
 * into an {@link AuthPrincipal}.
 *
 * Semantics match the retired `withAuthenticatedApiRouteGuard` wrapper:
 * - a token that does not verify resolves nobody (`null`), so the next
 *   accepted scheme is tried instead of failing the request outright;
 * - a token that verified but was revoked (logout, password reset) fails
 *   the request with 401, whatever other credentials were presented;
 * - a disabled account is refused with 403.
 */
export async function principalFromTokenSource(
  context: AuthServerApiContext,
  schemeName: string,
  source: PotentiallyValidTokenSource,
): Promise<AuthPrincipal<UserData> | null> {
  let guard: IRouteGuard;
  try {
    guard = await new RouteGuardFactory(context.db, context.redis).createGuardFromTokenSources(
      "authenticated",
      [source],
      getAuthServerAppId(),
    );
  } catch (e: unknown) {
    if (context.debug) {
      console.warn(`[api/auth-resolvers] ${source.sourceHint ?? source.type} did not verify:`, e);
    }
    return null;
  }

  if (guard.revoked === true) {
    throw new OperationError(401, {
      error: "token_revoked",
      message: "Authentication failed, token has been revoked",
    });
  }

  const user: UserData | null = guard.user;
  if (!user) return null;

  if (user.disabled) {
    throw new OperationError(403, {
      error: "account_disabled",
      message: "Your account is disabled!",
    });
  }

  return {
    scheme: schemeName,
    user,
    isAdmin: user.admin === true,
    scope: guard.scope,
    getOrganizationRole: async (organization_id) => {
      try {
        return await isUserInOrganization(context.db, user, organization_id);
      } catch (e: unknown) {
        // isUserInOrganization() rejects malformed organization ids with a
        // TypeError; a malformed id can never name an organization the
        // user belongs to.
        if (e instanceof TypeError) return false;
        throw e;
      }
    },
  };
}
