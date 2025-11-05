import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";

/**
 *
 * @param auth ISchemaVaultsAuthClient | Reference to initialized auth client
 * @returns Path/URL of where the user should be sent after successful authentication
 * @example successful_authentication_redirect_uri: `/account`
 */
function getSuccessfulAuthenticationRedirectUri(
  auth: ISchemaVaultsAuthClient,
): string {
  const successful_authentication_redirect_uri: string =
    auth.successful_authentication_redirect_uri;
  return successful_authentication_redirect_uri;
}

export default getSuccessfulAuthenticationRedirectUri;
