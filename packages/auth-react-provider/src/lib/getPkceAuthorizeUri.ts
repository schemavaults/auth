import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";

/**
 *
 * @param auth ISchemaVaultsAuthClient | Reference to initialized auth client
 * @returns Path/URL of where the user should be sent after successful authentication
 * @example authorize_uri: `/auth/authorize`
 */
function getPkceAuthorizeUri(auth: ISchemaVaultsAuthClient): string {
  const authorize_uri: string | undefined = auth.authorize_uri;
  if (typeof authorize_uri !== "string") {
    throw new Error(
      `Failed to load 'authorize_uri' for auth client (app ID: '${auth.app_id}')`,
    );
  }
  return authorize_uri;
}

export default getPkceAuthorizeUri;
