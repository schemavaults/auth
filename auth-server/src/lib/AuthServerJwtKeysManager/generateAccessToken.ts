import {
  type SchemaVaultsAppEnvironment,
  type AppId,
  appIdSchema,
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import type AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";
import { I_JWT_Keys, JWT_Factory } from "@schemavaults/jwt";
import type { AccessToken, UserData } from "@schemavaults/auth-common";

export interface IGenerateAccessTokenOpts {
  auth_jwt_manager: AuthServerJwtKeysManager;
  client_app_id: AppId;
  audience_id: ApiServerId;
  user: UserData;
  user_organizations: readonly string[];
  environment: SchemaVaultsAppEnvironment;
}

export default async function generateAccessToken({
  auth_jwt_manager,
  client_app_id,
  audience_id,
  user,
  user_organizations,
  environment,
}: IGenerateAccessTokenOpts): Promise<AccessToken> {
  if (!appIdSchema.safeParse(client_app_id).success) {
    throw new TypeError("Invalid client app ID");
  }

  if (!apiServerIdSchema.safeParse(audience_id).success) {
    throw new TypeError("Invalid audience ID");
  }

  const appropriate_jwt_keys: I_JWT_Keys =
    await auth_jwt_manager.getFreshEnoughKeysetOrCreateNew(audience_id);
  const jwt_factory = new JWT_Factory({
    client_app_id,
    user,
    user_organizations,
    environment,
    jwt_keys: appropriate_jwt_keys,
  });
  const token: AccessToken = await jwt_factory.access(audience_id);
  return token;
}
