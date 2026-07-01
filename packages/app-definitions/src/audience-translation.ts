import type { ApiServerId } from "./api-server-id";
import type { SchemaVaultsAppEnvironment } from "./app-environments";
import { getAppEnvironment } from "./get-app-environment";
import { getAuthServerUrl } from "./get-auth-server-url";
import { SCHEMAVAULTS_AUTH_APP_ID } from "./SCHEMAVAULTS_AUTH_APP_ID";

/**
 * Translate a stable, persisted API server identifier (e.g. the auth app id
 * "schemavaults-auth", or a resource API server UUID) into the audience value
 * that belongs in a JWT's `aud` claim.
 *
 * The auth server is special-cased: its app id maps to the (white-labellable)
 * auth server URL, because the URL may change while the app id stays stable.
 * Every other api server id is used verbatim as its own token audience.
 *
 * @see getApiServerIdForTokenAudience for the inverse.
 */
export function getTokenAudienceForApiServerId(
  api_server_id: ApiServerId,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): string {
  if (api_server_id === SCHEMAVAULTS_AUTH_APP_ID) {
    return getAuthServerUrl(environment);
  }
  return api_server_id;
}

/**
 * Translate a JWT `aud` claim back into the stable, persisted API server
 * identifier used for storage and keyset lookups.
 *
 * The auth server URL maps back to the auth app id "schemavaults-auth"; every
 * other token audience is used verbatim as its own api server id.
 *
 * @see getTokenAudienceForApiServerId for the inverse.
 */
export function getApiServerIdForTokenAudience(
  token_audience: string,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): ApiServerId {
  if (token_audience === getAuthServerUrl(environment)) {
    return SCHEMAVAULTS_AUTH_APP_ID;
  }
  return token_audience;
}
