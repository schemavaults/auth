import maybeStripQuotes from "./maybe-strip-quotes";

export const DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME = "SchemaVaults";

/**
 * @description Resolves the display name of the organization that owns this
 * auth server deployment from the SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION_NAME
 * environment variable. Shown wherever the platform organization appears
 * (e.g. organization lists), so white-label deployments can rebrand it
 * alongside SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION.
 */
export function getAuthServerOwnerOrganizationName(): string {
  const owner_organization_name: string | undefined = maybeStripQuotes(
    process.env.SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION_NAME,
  );
  if (
    typeof owner_organization_name === "string" &&
    owner_organization_name.length > 0
  ) {
    return owner_organization_name;
  }
  return DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME;
}

export default getAuthServerOwnerOrganizationName;
