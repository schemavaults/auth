import "server-only";
import { connection, type NextRequest, NextResponse } from "next/server";
import { ServerlessDatabase } from "@/lib/auth-db";
import { organizationIdSchema, type OrganizationID, type UserData } from "@schemavaults/auth-common";
import { apiServerIdSchema } from "@schemavaults/app-definitions";
import verifyJwksAccessAssertion from "@/app/api/jwks/[audience]/verifyJwksAccessAssertion";
import isValidUuid from "@/lib/is-valid-uuid";
import SchemaVaultsApiServerRegistry from "@/lib/auth-db/apis";
import getUserByUID from "@/lib/auth-db/users/get-user-by-uid";
import isUserInOrganization from "@/lib/isUserInOrganization";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/resource-server/organizations/[organization_id]/members/[uid]/role";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ organization_id: string; uid: string }> }
): Promise<NextResponse> {
  await connection();
  const { organization_id: raw_org_id, uid } = await props.params;

  // Validate organization_id
  const parsed_org_id = organizationIdSchema.safeParse(raw_org_id);
  if (!parsed_org_id.success) {
    return NextResponse.json(
      { success: false, error: "Invalid organization ID" },
      { status: 400 },
    );
  }
  const organization_id: OrganizationID = parsed_org_id.data;

  // Validate uid
  if (!uid || !isValidUuid(uid)) {
    return NextResponse.json(
      { success: false, error: "Invalid user ID" },
      { status: 400 },
    );
  }

  // Extract API server ID from custom header
  const api_server_id = request.headers.get("X-Api-Server-Id");
  if (!api_server_id || !apiServerIdSchema.safeParse(api_server_id).success) {
    return NextResponse.json(
      { success: false, error: "Missing or invalid X-Api-Server-Id header" },
      { status: 400 },
    );
  }

  // Extract assertion from Authorization header
  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const [type, assertion] = authorization.split(" ");
  if (type !== "Bearer" || !assertion) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  await using dbh = ServerlessDatabase.createDBH();

  // Verify the signed assertion using the resource server's public key
  const isAuthenticated: boolean = await verifyJwksAccessAssertion(
    assertion,
    api_server_id,
    dbh.db,
  );
  if (!isAuthenticated) {
    console.warn(
      `[resource-server/organizations] Unauthorized request from api_server_id="${api_server_id}" ` +
      `to check membership for uid="${uid}" in org="${organization_id}"`,
    );
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Verify the API server owns the requested organization
  try {
    const apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);
    const apiServer = await apiServerRegistry.getApiServer(api_server_id);
    if (!apiServer || apiServer.owner_organization_id !== organization_id) {
      return NextResponse.json(
        { success: false, error: "Forbidden - API server does not own this organization" },
        { status: 403 },
      );
    }
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "resource-server-organization-role.verifyApiServerOwnership",
      route: ROUTE,
      context: { api_server_id, organization_id },
    });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }

  try {
    const userDoc = await getUserByUID(dbh.db, uid);
    if (!userDoc) {
      return NextResponse.json({
        success: true,
        data: { organization_id, uid, role: null },
      });
    }

    const userData: UserData = { ...userDoc, sub: userDoc.uid };
    const role = await isUserInOrganization(dbh.db, userData, organization_id);

    return NextResponse.json({
      success: true,
      data: {
        organization_id,
        uid,
        role: role || null,
      },
    });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "resource-server-organization-role.checkMembership",
      route: ROUTE,
      uid,
      context: { api_server_id, organization_id },
    });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
