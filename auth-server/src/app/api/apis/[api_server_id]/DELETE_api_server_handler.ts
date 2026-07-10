import "server-only";

import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import {
  type ApiServerId,
  apiServerIdSchema,
  isHardcodedApiServerId,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { isUserInOrganizationWithRole } from "@/lib/isUserInOrganization";
import { type OrganizationID } from "@schemavaults/auth-common";

export async function DELETE_api_server_handler(
  req: NextRequest,
  ctx: RouteContext<"/api/apis/[api_server_id]">,
): Promise<NextResponse> {
  const params = await ctx.params;

  const parsed_api_server_id = await apiServerIdSchema.safeParseAsync(
    params.api_server_id,
  );
  if (!parsed_api_server_id.success) {
    return NextResponse.json(
      { success: false, message: "Invalid api_server_id parameter" },
      { status: 400 },
    );
  }
  const api_server_id: ApiServerId = parsed_api_server_id.data;

  if (isHardcodedApiServerId(api_server_id)) {
    return NextResponse.json(
      { success: false, message: "Cannot delete a hardcoded API server!" },
      { status: 403 },
    );
  }

  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      const registry = new SchemaVaultsApiServerRegistry(dbh.db);

      const apiServer = await registry.getApiServer(api_server_id);
      if (!apiServer) {
        return NextResponse.json(
          { success: false, message: "API server not found" },
          { status: 404 },
        );
      }

      const isGlobalAdmin = user.admin === true;
      if (!isGlobalAdmin) {
        if (!apiServer.owner_organization_id) {
          return NextResponse.json(
            { success: false, message: "Only global admins can delete this API server" },
            { status: 403 },
          );
        }
        const isOrgOwner = await isUserInOrganizationWithRole(
          user,
          apiServer.owner_organization_id as OrganizationID,
          "owner",
          dbh.db,
        );
        if (!isOrgOwner) {
          return NextResponse.json(
            { success: false, message: "Only organization owners or global admins can delete API servers" },
            { status: 403 },
          );
        }
      }

      const result = await registry.deleteApiServer(api_server_id);
      if (!result.success) {
        return NextResponse.json(
          { success: false, message: result.message },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { success: true, message: result.message },
        { status: 200 },
      );
    },
  );

  return await protected_route(req);
}

export default DELETE_api_server_handler;
