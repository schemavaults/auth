import type { IJwtKeyManager } from "@/JwtKeyManager/IJwtKeyManager";
import type { JWKS } from "@schemavaults/jwt";
import loadRemoteJwks from "./loadRemoteJwks";
import {
  type ApiServerId,
  apiServerIdSchema,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
} from "@schemavaults/app-definitions";
import getSchemaVaultsAuthServerUri from "@/get-schemavaults-auth-server-uri";
import loadJwksAccessPrivateKey from "@/env/loadJwksAccessPrivateKey";

export interface IRemoteJwtKeyManagerConstructorOpts {
  auth_server_uri?: string;
  debug?: boolean;
}

export class RemoteJwtKeyManager implements IJwtKeyManager {
  private readonly auth_server_uri: string;
  private readonly debug: boolean;

  public constructor({
    auth_server_uri = getSchemaVaultsAuthServerUri(),
    ...opts
  }: IRemoteJwtKeyManagerConstructorOpts) {
    this.auth_server_uri = auth_server_uri;
    this.debug = typeof opts.debug === "boolean" ? opts.debug : false;
  }

  public async loadJwks(audienceId: ApiServerId): Promise<JWKS> {
    if (!apiServerIdSchema.safeParse(audienceId).success) {
      throw new Error(
        `Invalid audience to load remote JWKS for: '${audienceId}'`,
      );
    }

    if (this.debug) {
      console.log(
        `[RemoteJwtKeyManager] loadJwks(audience_id='${audienceId}')`,
      );
    }

    if (audienceId === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
      throw new Error(
        `Auth server doesn't need to load remote JWKS; it already has the keys.`,
      );
    }

    let jwks_access_private_key: CryptoKey;
    try {
      jwks_access_private_key = await loadJwksAccessPrivateKey(process.env);
    } catch (e: unknown) {
      console.error(e);
      throw new TypeError(
        "Failed to load JWKS access private key from environment variables!",
      );
    }

    return await loadRemoteJwks({
      auth_server_uri: this.auth_server_uri,
      api_server_id: audienceId,
      jwks_access_private_key,
      debug: this.debug,
    });
  }
}

export default RemoteJwtKeyManager;
