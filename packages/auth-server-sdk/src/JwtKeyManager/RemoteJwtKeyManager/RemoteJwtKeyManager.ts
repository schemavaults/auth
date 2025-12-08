import type { IJwtKeyManager } from "@/JwtKeyManager/IJwtKeyManager";
import type { JWKS } from "@schemavaults/jwt";
import loadRemoteJwks from "./loadRemoteJwks";

export interface IRemoteJwtKeyManagerConstructorOpts {
  auth_server_uri: string;
}

export class RemoteJwtKeyManager implements IJwtKeyManager {
  private readonly auth_server_uri: string;

  public constructor({ auth_server_uri }: IRemoteJwtKeyManagerConstructorOpts) {
    this.auth_server_uri = auth_server_uri;
  }

  public async loadJwks(): Promise<JWKS> {
    return await loadRemoteJwks({
      auth_server_uri: this.auth_server_uri,
    });
  }
}

export default RemoteJwtKeyManager;
