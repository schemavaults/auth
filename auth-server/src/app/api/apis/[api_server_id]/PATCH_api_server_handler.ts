import "server-only";

import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import {
  type ApiServerId,
  apiServerIdSchema,
  isHardcodedApiServerId,
  resourceUrlMatchModeSchema,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { canUserManageResource } from "@/lib/ownership/resource-access";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apis/[api_server_id]";

/**
 * Body of `PATCH /api/apis/[api_server_id]`: the API server's
 * dynamic-client policy (migration 00040). Both members are optional but
 * at least one must be present; nothing else about an API server is
 * updatable through this route.
 */
export const patchApiServerBodySchema = z
  .object({
    allow_dynamic_clients: z.boolean().optional(),
    resource_url_match_mode: resourceUrlMatchModeSchema.optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.allow_dynamic_clients !== undefined ||
      body.resource_url_match_mode !== undefined,
    "At least one of 'allow_dynamic_clients' or 'resource_url_match_mode' is required",
  );

export type PatchApiServerResponse =
  | { success: true; api_server: SchemaVaultsApiServerDefinition }
  | { success: false; message: string };

/**
 * Update an API server's dynamic-client policy: whether clients
 * registered through RFC 7591 dynamic client registration may obtain
 * access tokens for it (as an RFC 8707 `resource`) without an explicit
 * app-to-API connection, and whether a `resource` URL must equal a
 * registered domain (`exact`) or may be any URL under one (`prefix`).
 * Organization owners/admins, the owning user, or global admins.
 */
export async function PATCH_api_server_handler(
  req: NextRequest,
  ctx: RouteContext<"/api/apis/[api_server_id]">,
): Promise<NextResponse> {
  // Params are parsed inside the guard so unauthenticated callers get a
  // 401 without observing whether the API server id was well-formed.
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      const params = await ctx.params;

      const parsed_api_server_id = await apiServerIdSchema.safeParseAsync(
        params.api_server_id,
      );
      if (!parsed_api_server_id.success) {
        return NextResponse.json(
          { success: false, message: "Invalid api_server_id parameter" } satisfies PatchApiServerResponse,
          { status: 400 },
        );
      }
      const api_server_id: ApiServerId = parsed_api_server_id.data;

      if (isHardcodedApiServerId(api_server_id)) {
        return NextResponse.json(
          { success: false, message: "Cannot update a hardcoded API server!" } satisfies PatchApiServerResponse,
          { status: 403 },
        );
      }

      const parsed_body = patchApiServerBodySchema.safeParse(
        await req.json().catch(() => null),
      );
      if (!parsed_body.success) {
        return NextResponse.json(
          {
            success: false,
            message:
              parsed_body.error.issues[0]?.message ?? "Invalid request body",
          } satisfies PatchApiServerResponse,
          { status: 400 },
        );
      }

      const registry = new SchemaVaultsApiServerRegistry(dbh.db);
      const apiServer = await registry.getApiServer(api_server_id);
      if (!apiServer) {
        return NextResponse.json(
          { success: false, message: "API server not found" } satisfies PatchApiServerResponse,
          { status: 404 },
        );
      }

      const canManage: boolean = await canUserManageResource(
        dbh.db,
        user,
        apiServer,
      );
      if (!canManage) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Only the API server's managers (organization owners/admins, the owning user, or global admins) can change its dynamic-client policy",
          } satisfies PatchApiServerResponse,
          { status: 403 },
        );
      }

      try {
        const updated = await registry.setApiServerDynamicClientPolicy(
          api_server_id,
          parsed_body.data,
        );
        if (!updated) {
          return NextResponse.json(
            { success: false, message: "API server not found" } satisfies PatchApiServerResponse,
            { status: 404 },
          );
        }
        return NextResponse.json(
          { success: true, api_server: updated } satisfies PatchApiServerResponse,
          { status: 200 },
        );
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "PATCH_api_server_handler",
          route: ROUTE,
          context: { api_server_id },
        });
        return NextResponse.json(
          { success: false, message: "Failed to update the API server" } satisfies PatchApiServerResponse,
          { status: 500 },
        );
      }
    },
  );

  return await protected_route(req);
}

export default PATCH_api_server_handler;
