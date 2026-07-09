import maybeStripQuotes from "./maybe-strip-quotes";
import {
  type OrganizationID,
  organizationIdSchema,
} from "./organization-id";

export const DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID =
  "schemavaults" as const satisfies OrganizationID;

/**
 * @description Resolves the organization ID that owns this auth server
 * deployment from the SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION environment
 * variable. This organization virtually owns the auth server's own hardcoded
 * app/API definitions (stored in the database as a NULL owner) and is reserved
 * in the organizations registry, so white-label deployments can rebrand the
 * platform organization (e.g. "acme-corp").
 *
 * @throws if the environment variable is set but is not a valid organization ID
 */
export function getAuthServerOwnerOrganizationId(): OrganizationID {
  const owner_organization_id: string | undefined = maybeStripQuotes(
    process.env.SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION,
  );
  if (
    typeof owner_organization_id !== "string" ||
    owner_organization_id.length === 0
  ) {
    return DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID;
  }

  const parsed = organizationIdSchema.safeParse(owner_organization_id);
  if (!parsed.success) {
    throw new Error(
      "Failed to load 'SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION' from environment variables!",
      {
        cause: parsed.error,
      },
    );
  }
  return parsed.data;
}

export default getAuthServerOwnerOrganizationId;
