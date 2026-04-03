import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import type { OrganizationMembershipRoleType } from "@schemavaults/auth-common";
import PATCH_member_role_handler from "./PATCH_member_role_handler";
import GET_member_role_handler from "./GET_member_role_handler";

interface RouteContext {
  params: Promise<{ organization_id: string; uid: string }>;
}

interface UpdateRoleRequestBody {
  role: OrganizationMembershipRoleType;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return (await withAuthenticatedApiRouteGuard(
    async (props: IProtectedAuthenticatedApiRouteProps) => {
      const { organization_id, uid } = await context.params;
      return await GET_member_role_handler(props, organization_id, uid);
    },
  ))(req);
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return (await withAuthenticatedApiRouteGuard(
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
  ))(req);
}
