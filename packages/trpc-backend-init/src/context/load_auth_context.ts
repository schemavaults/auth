// load_auth_context.ts

import {
  getSchemavaultsApiServerId,
  RemoteJwtKeyManager,
  decodeJWTsWithKeyManager,
  type IJwtKeyManager,
} from "@schemavaults/auth-server-sdk";

export type AuthContext = Awaited<ReturnType<typeof decodeJWTsWithKeyManager>>;

import {
  type ApiServerId,
  getAppEnvironment,
  getAuthServerUri,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

const bearerPrefix: "Bearer " = "Bearer " as const;

export async function loadAuthContext(
  authHeader: string | null,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): Promise<AuthContext> {
  if (!authHeader) {
    if (environment === "development") {
      console.log("[loadAuthContext] No authorization header found");
    }
    return {
      user: null,
    };
  }
  const token: string | undefined = authHeader.startsWith(bearerPrefix)
    ? authHeader.slice(bearerPrefix.length)
    : authHeader;
  // token parsed from header now

  if (!token) {
    if (environment === "development") {
      console.log("[loadAuthContext] No auth token found");
    }
    return {
      user: null,
    };
  }

  const audience: ApiServerId = getSchemavaultsApiServerId();
  if (typeof audience !== "string")
    throw new Error(
      "Environment variable 'SCHEMAVAULTS_API_SERVER_ID' not set or passed to auth context loader",
    );

  const remote_jwt_key_manager: IJwtKeyManager = new RemoteJwtKeyManager({
    auth_server_uri: getAuthServerUri(),
    debug: environment === "development",
  });

  // Proceed to validate the token
  try {
    if (environment === "development") {
      console.log(
        `[loadAuthContext] Attempting to verify auth token '${token}'...`,
      );
    }

    const result = await decodeJWTsWithKeyManager(remote_jwt_key_manager, [
      {
        token,
        sourceHint: "tRPC Authorization Bearer Header",
        type: "access",
      },
    ]);

    if (environment === "development" && result.user) {
      console.log(
        `[loadAuthContext] Successfully verified auth token for user '${result.user.email}'`,
      );
    }

    return result;
  } catch (error: unknown) {
    if (environment === "development") {
      console.warn("[loadAuthContext] Could not verify the token: ", error);
    }
    return {
      user: null,
    };
  }
}

export default loadAuthContext;
