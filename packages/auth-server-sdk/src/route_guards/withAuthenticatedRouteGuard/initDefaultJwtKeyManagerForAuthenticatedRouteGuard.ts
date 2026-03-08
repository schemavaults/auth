import getSchemaVaultsAuthServerUri from "@/get-schemavaults-auth-server-uri";
import type { IJwtKeyManager } from "@/JwtKeyManager/IJwtKeyManager";
import RemoteJwtKeyManager from "@/JwtKeyManager/RemoteJwtKeyManager";

// default key manager is RemoteJwtKeyManager-- makes it easier for external apps, we can overwrite this once for the auth server
export function initDefaultJwtKeyManagerForAuthenticatedRouteGuard(
  debug: boolean = process.env.NODE_ENV === "development",
): IJwtKeyManager {
  return new RemoteJwtKeyManager({
    auth_server_uri: getSchemaVaultsAuthServerUri(),
    debug,
  });
}

export default initDefaultJwtKeyManagerForAuthenticatedRouteGuard;
