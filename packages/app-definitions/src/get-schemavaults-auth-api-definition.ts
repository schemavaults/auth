import type { SchemaVaultsApiServerDefinition } from "./api-server-definition";
import { defaultHardcodedAppCreationTime } from "./default-hardcoded-app-creation-time";
import getAuthServerDescription from "./get-auth-server-description";
import getAuthServerFriendlyName from "./get-auth-server-friendly-name";
import getAuthServerAppId from "./get-auth-server-app-id";
import getAuthServerOwnerOrganizationId from "./get-auth-server-owner-organization-id";

/**
 * @description Builds the auth server's own hardcoded API server definition.
 * Resolved at call time (not module load) so the API server id, owner
 * organization, name, and description reflect the deployment's environment
 * variables.
 */
export function getSchemaVaultsAuthApiDefinition(): SchemaVaultsApiServerDefinition {
  return {
    api_server_id: getAuthServerAppId(),
    api_server_name: getAuthServerFriendlyName(),
    api_server_description: getAuthServerDescription(),
    hardcoded: true,
    created_at: defaultHardcodedAppCreationTime,
    owner_organization_id: getAuthServerOwnerOrganizationId(),
    public: true,
  };
}

export default getSchemaVaultsAuthApiDefinition;
