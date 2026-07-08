import "server-only";
import { connection, NextResponse, type NextRequest } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import type { OrganizationMembershipRoleType } from "@schemavaults/auth-common";
import PATCH_member_role_handler from "./PATCH_member_role_handler";
import GET_member_role_handler from "./GET_member_role_handler";

interface UpdateRoleRequestBody {
  role: OrganizationMembershipRoleType;
}

export async function GET(req: NextRequest, context: RouteContext<"/api/organizations/[organization_id]/members/[uid]/role">): Promise<NextResponse> {
  await connection();
  const handler = await withAuthenticatedApiRouteGuard(
    async (props: IProtectedAuthenticatedApiRouteProps) => {
      const { organization_id, uid } = await context.params;
      return await GET_member_role_handler(props, organization_id, uid);
    },
  )

  return await handler(req);
}

export async function PATCH(req: NextRequest, context: RouteContext<"/api/organizations/[organization_id]/members/[uid]/role">): Promise<NextResponse> {
  await connection();
  const handler = await withAuthenticatedApiRouteGuard(
    async (props: IProtectedAuthenticatedApiRouteProps) => {
      let body: UpdateRoleRequestBody;
      try {
        body = await req.json();
        if (typeof body !== "object" || !body || typeof body.role !== "string") {
          throw new Error("Invalid request body");
        }
      } catch {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid request body. Expected JSON with 'role' field.",
          },
          { status: 400 },
        );
      }

      const { organization_id, uid } = await context.params;

      return await PATCH_member_role_handler(props, organization_id, uid, body.role);
    },
  )

  return await handler(req);
}

export const dynamic = "force-dynamic"; // defaults to auto
