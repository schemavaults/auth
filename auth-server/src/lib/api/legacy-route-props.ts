import "server-only";
import type { UserData } from "@schemavaults/auth-common";
import type { OrganizationID, OrganizationMembershipRoleType } from "@schemavaults/auth-common/organizations";
import type { AuthPrincipal } from "@schemavaults/openapi-operations";
import type { IProtectedAuthenticatedApiRouteProps } from "@/lib/withAuthenticatedRouteGuard";
import type { IProtectedAdminApiRouteProps } from "@/lib/withAdminRouteGuard";
import isUserInOrganization from "@/lib/isUserInOrganization";
import type { AuthServerApiContext } from "./context";
import { toNextRequest } from "./next-request";

/** The subset of an operation handler context the bridge needs. */
export interface GuardedOperationContext {
  readonly auth: AuthPrincipal<UserData>;
  readonly context: AuthServerApiContext;
  readonly request: Request;
}

/**
 * Bridges an operation handler context to the `{ user, dbh, redis, req,
 * environment, isUserInOrganization }` props the pre-migration route
 * handlers were written against, so their bodies can be reused as-is
 * behind an operation. New code should read `ctx.auth` / `ctx.context`
 * directly.
 *
 * Note: when the operation declares a validated request body the request
 * stream has already been consumed; such handlers must take the parsed
 * body from `ctx.body` instead of calling `req.json()`.
 */
export function legacyRouteProps(
  ctx: GuardedOperationContext,
): IProtectedAuthenticatedApiRouteProps & IProtectedAdminApiRouteProps {
  const user = ctx.auth.user;
  if (!user) {
    throw new TypeError("legacyRouteProps() needs a user principal (session-guarded operation)");
  }
  const { dbh, redis, environment } = ctx.context;
  return {
    req: toNextRequest(ctx.request),
    user,
    environment,
    dbh,
    redis,
    isUserInOrganization: (
      member: UserData,
      organization_id: OrganizationID,
    ): Promise<OrganizationMembershipRoleType | false> =>
      isUserInOrganization(dbh.db, member, organization_id),
  };
}
