import type { SchemaVaultsApp } from "./client-app-definition";
import { defaultHardcodedAppCreationTime } from "./default-hardcoded-app-creation-time";
import getAuthServerDescription from "./get-auth-server-description";
import getAuthServerFriendlyName from "./get-auth-server-friendly-name";
import getAuthServerAppId from "./get-auth-server-app-id";
import getAuthServerOwnerOrganizationId from "./get-auth-server-owner-organization-id";

/**
 * @description Builds the auth server's own hardcoded client app definition.
 * Resolved at call time (not module load) so the app id, owner organization,
 * name, and description reflect the deployment's environment variables.
 */
export function getSchemaVaultsAuthAppDefinition(): SchemaVaultsApp {
  return {
    app_id: getAuthServerAppId(),
    app_name: getAuthServerFriendlyName(),
    app_description: getAuthServerDescription(),
    hardcoded: true,
    created_at: defaultHardcodedAppCreationTime,
    owner_organization_id: getAuthServerOwnerOrganizationId(),
    public: true,
    web: true,
  };
}

export default getSchemaVaultsAuthAppDefinition;
