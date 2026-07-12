import type { SchemaVaultsApiServerDefinition } from "./api-server-definition";
import { defaultHardcodedAppCreationTime } from "./default-hardcoded-app-creation-time";
import getAuthServerFriendlyName from "./get-auth-server-friendly-name";
import getAuthServerOwnerOrganizationId from "./get-auth-server-owner-organization-id";
import { OIDC_USERINFO_AUDIENCE_ID } from "./oidc-userinfo-audience";

/**
 * @description Builds the hardcoded API server definition that reserves the
 * OIDC userinfo audience id (see oidc-userinfo-audience.ts). Resolved at
 * call time (not module load) so the owner organization and friendly name
 * reflect the deployment's environment variables.
 *
 * `public: false` is load-bearing: the connect_app route only lets app
 * owners self-serve APP_TO_API_PERMISSIONS rows for PUBLIC hardcoded APIs,
 * so ordinary client apps cannot attach themselves to this audience — the
 * OIDC surface issues tokens for it without consulting that permission
 * table at all.
 */
export function getOidcUserinfoApiDefinition(): SchemaVaultsApiServerDefinition {
  // schemaVaultsApiServerDefinitionSchema caps api_server_name at 64 chars;
  // clamp so a long white-label friendly name can't produce an invalid
  // hardcoded definition.
  const api_server_name: string =
    `${getAuthServerFriendlyName()} OIDC UserInfo`.slice(0, 64);
  return {
    api_server_id: OIDC_USERINFO_AUDIENCE_ID,
    api_server_name,
    api_server_description:
      "OpenID Connect userinfo endpoint audience. Access tokens issued to " +
      "OIDC relying parties target this audience and are redeemable only " +
      "at the auth server's /api/oidc/userinfo endpoint.",
    hardcoded: true,
    created_at: defaultHardcodedAppCreationTime,
    owner_organization_id: getAuthServerOwnerOrganizationId(),
    public: false,
  };
}

export default getOidcUserinfoApiDefinition;
