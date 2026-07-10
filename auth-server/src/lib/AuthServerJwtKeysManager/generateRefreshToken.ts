import {
  type SchemaVaultsAppEnvironment,
  type AppId,
  appIdSchema,
} from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import type AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";
import { type I_JWT_Keys, JWT_Factory } from "@schemavaults/jwt";
import type { RefreshToken, UserData } from "@schemavaults/auth-common";

export interface IGenerateRefreshTokenOpts {
  auth_jwt_manager: AuthServerJwtKeysManager;
  client_app_id: AppId;
  user: UserData;
  user_organizations: readonly string[];
  environment: SchemaVaultsAppEnvironment;
}

export default async function generateRefreshToken({
  auth_jwt_manager,
  client_app_id,
  user,
  user_organizations,
  environment,
}: IGenerateRefreshTokenOpts): Promise<RefreshToken> {
  if (!appIdSchema.safeParse(client_app_id).success) {
    throw new Error("Invalid client app ID");
  }

  const auth_server_jwt_keys: I_JWT_Keys =
    await auth_jwt_manager.getFreshEnoughKeysetOrCreateNew(
      getAuthServerAppId(),
    );
  const jwt_factory = new JWT_Factory({
    client_app_id,
    user,
    user_organizations,
    environment,
    jwt_keys: auth_server_jwt_keys,
  });
  const token: RefreshToken = await jwt_factory.refresh();
  return token;
}
