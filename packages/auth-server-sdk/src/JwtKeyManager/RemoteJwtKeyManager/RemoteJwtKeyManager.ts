import type { IJwtKeyManager } from "@/JwtKeyManager/IJwtKeyManager";
import type { JWKS } from "@schemavaults/jwt";
import loadRemoteJwks from "./loadRemoteJwks";
import {
  apiServerIdSchema,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
} from "@schemavaults/app-definitions";
import getSchemaVaultsAuthServerUri from "@/get-schemavaults-auth-server-uri";

export interface IRemoteJwtKeyManagerConstructorOpts {
  auth_server_uri?: string;
}

export class RemoteJwtKeyManager implements IJwtKeyManager {
  private readonly auth_server_uri: string;

  public constructor({
    auth_server_uri = getSchemaVaultsAuthServerUri(),
  }: IRemoteJwtKeyManagerConstructorOpts) {
    this.auth_server_uri = auth_server_uri;
  }

  public async loadJwks(audienceId: string): Promise<JWKS> {
    if (!apiServerIdSchema.safeParse(audienceId).success) {
      throw new Error(
        `Invalid audience to load remote JWKS for: '${audienceId}'`,
      );
    }

    if (audienceId === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
      throw new Error(
        `Auth server doesn't need to load remote JWKS; it already has the keys.`,
      );
    }

    return await loadRemoteJwks({
      auth_server_uri: this.auth_server_uri,
    });
  }
}

export default RemoteJwtKeyManager;
