import getSchemaVaultsAuthServerUri from "@/env/get-schemavaults-auth-server-uri";
import type { IJwtKeyManager } from "@/JwtKeyManager/IJwtKeyManager";
import RemoteJwtKeyManager from "@/JwtKeyManager/RemoteJwtKeyManager";

// default key manager is RemoteJwtKeyManager-- makes it easier for external apps, we can overwrite this once for the auth server
export function initDefaultJwtKeyManagerForAuthenticatedRouteGuard(
  debug: boolean = process.env.NODE_ENV === "development",
): IJwtKeyManager {
  let auth_server_uri: string;
  try {
    auth_server_uri = getSchemaVaultsAuthServerUri();
  } catch (e: unknown) {
    // getSchemaVaultsAuthServerUri() throws when SCHEMAVAULTS_AUTH_SERVER_URI
    // is set to an invalid value (wrong protocol, or http:// in
    // production/staging). Surface this in the logs before letting the
    // exception propagate up to the route guard.
    console.error(
      "[initDefaultJwtKeyManagerForAuthenticatedRouteGuard] Failed to resolve auth server URI from environment. Check the 'SCHEMAVAULTS_AUTH_SERVER_URI' environment variable (must start with 'https://' in production/staging). Underlying error: ",
      e,
    );
    throw e;
  }
  return new RemoteJwtKeyManager({
    auth_server_uri,
    debug,
  });
}

export default initDefaultJwtKeyManagerForAuthenticatedRouteGuard;
