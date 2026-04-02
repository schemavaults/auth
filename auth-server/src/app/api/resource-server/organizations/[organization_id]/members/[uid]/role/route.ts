import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { ServerlessDatabase } from "@/lib/auth-db";
import { organizationIdSchema, type OrganizationID } from "@schemavaults/auth-common";
import { apiServerIdSchema } from "@schemavaults/app-definitions";
import verifyJwksAccessAssertion from "@/app/api/jwks/[audience]/verifyJwksAccessAssertion";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import isValidUuid from "@/lib/is-valid-uuid";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ organization_id: string; uid: string }> }
): Promise<NextResponse> {
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

  try {
    const organizationsRegistry = new OrganizationsRegistry(dbh.db);
    const memberships = await organizationsRegistry.listUserOrganizationMemberships(uid, false);
    const membership = memberships.find(m => m.organization_id === organization_id);

    return NextResponse.json({
      success: true,
      data: {
        organization_id,
        uid,
        role: membership ? membership.role : null,
      },
    });
  } catch (e: unknown) {
    console.error(
      `[resource-server/organizations] Failed to check membership for uid="${uid}" in org="${organization_id}":`,
      e,
    );
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
