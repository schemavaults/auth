import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { listUserOrganizationMemberships, OrganizationsRegistry } from "@/lib/auth-db/organizations";
import type { OrganizationMembershipRoleDefinition } from "@/lib/auth-db/organizations";
import {
  organizationMembershipRoleDetailsSchema,
  type OrganizationDefinition,
  type OrganizationMembershipRoleDetails,
} from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";
import { buildCorsHeaders, getOriginFromRequest } from "@/lib/cors/cors-for-client-app";
import { getAuthServerUri } from "@/lib/auth_server_uri";

const ROUTE = "/api/me/organizations";
const CORS_METHODS = "GET, OPTIONS" as const;

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Apply CORS headers so this endpoint can be called from any domain.
 *
 * When the request originates from the auth-server itself, its own origin is
 * reflected and credentials are allowed so the cookie-based session is
 * accepted. For any other origin, "Access-Control-Allow-Origin: *" is used;
 * credentials are omitted because the CORS spec forbids "*" together with
 * Access-Control-Allow-Credentials: true, and external apps authenticate with
 * an Authorization Bearer token rather than cookies.
 */
function applyCorsHeaders(req: NextRequest, response: NextResponse): NextResponse {
  const origin = getOriginFromRequest(req);
  if (!origin) {
    return response;
  }

  const corsHeaders: HeadersInit =
    origin === getAuthServerUri()
      ? buildCorsHeaders(origin, CORS_METHODS)
      : {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": CORS_METHODS,
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
          Vary: "Origin",
        };

  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

async function GET_my_organizations_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
): Promise<NextResponse> {
  try {
    const admin: boolean = user.admin ?? false;
    const memberships: readonly OrganizationMembershipRoleDefinition[] =
      await listUserOrganizationMemberships(dbh.db, user.uid, admin);

    const organizationsRegistry = new OrganizationsRegistry(dbh.db);

    const enrichedResults = await Promise.allSettled(
      memberships.map(async (membership): Promise<OrganizationMembershipRoleDetails> => {
        const orgDef: OrganizationDefinition =
          await organizationsRegistry.lookupOrganization(membership.organization_id);
        const candidate = {
          organization_id: membership.organization_id,
          organization_name: orgDef.name,
          role: membership.role,
          created_at: orgDef.created_at,
          joined_at: membership.created_at,
        };
        const parsed = await organizationMembershipRoleDetailsSchema.safeParseAsync(
          candidate,
        );
        if (!parsed.success) {
          throw new Error(
            `Failed to validate OrganizationMembershipRoleDetails for organization "${membership.organization_id}": ${parsed.error.message}`,
          );
        }
        return parsed.data;
      }),
    );

    const enrichedMemberships: OrganizationMembershipRoleDetails[] = [];
    for (const [i, result] of enrichedResults.entries()) {
      if (result.status === "fulfilled") {
        enrichedMemberships.push(result.value);
      } else {
        const failedMembership = memberships[i];
        await captureServerException(dbh.db, result.reason, {
          op_name: "GET_my_organizations_handler.enrichMembership",
          route: ROUTE,
          uid: user.uid,
          context: {
            organization_id: failedMembership?.organization_id ?? "unknown",
            nonFatal: true,
          },
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Successfully listed user organization memberships",
        data: {
          memberships: enrichedMemberships,
        },
      },
      { status: 200 },
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_my_organizations_handler.listUserOrganizationMemberships",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list user organization memberships",
      },
      { status: 500 },
    );
  }
}

export function OPTIONS(req: NextRequest): NextResponse {
  return applyCorsHeaders(req, new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const response = await (await withAuthenticatedApiRouteGuard(GET_my_organizations_handler))(req);
  return applyCorsHeaders(req, response);
}
