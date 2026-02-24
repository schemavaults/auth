import type { ICacheableJwtKeyManager } from "@/JwtKeyManager/ICacheableJwtKeyManager";
import type { JWKS } from "@schemavaults/jwt";
import loadRemoteJwks from "./loadRemoteJwks";
import {
  type ApiServerId,
  apiServerIdSchema,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
} from "@schemavaults/app-definitions";
import getSchemaVaultsAuthServerUri from "@/get-schemavaults-auth-server-uri";
import loadJwksAccessPrivateKey from "@/env/loadJwksAccessPrivateKey";

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface IJwksCacheEntry {
  jwks: JWKS;
  fetchedAt: number;
}

export interface IRemoteJwtKeyManagerConstructorOpts {
  auth_server_uri?: string;
  debug?: boolean;
  cache_ttl_ms?: number;
}

export class RemoteJwtKeyManager implements ICacheableJwtKeyManager {
  private readonly auth_server_uri: string;
  private readonly debug: boolean;
  private readonly cache_ttl_ms: number;
  private readonly jwksCache: Map<string, IJwksCacheEntry> = new Map();

  public constructor({
    auth_server_uri = getSchemaVaultsAuthServerUri(),
    ...opts
  }: IRemoteJwtKeyManagerConstructorOpts) {
    this.auth_server_uri = auth_server_uri;
    this.debug = typeof opts.debug === "boolean" ? opts.debug : false;
    this.cache_ttl_ms =
      typeof opts.cache_ttl_ms === "number" && opts.cache_ttl_ms > 0
        ? opts.cache_ttl_ms
        : DEFAULT_CACHE_TTL_MS;
  }

  public invalidateJwksCache(audienceId: string): void {
    if (this.debug) {
      console.log(
        `[RemoteJwtKeyManager] invalidateJwksCache(audience_id='${audienceId}')`,
      );
    }
    this.jwksCache.delete(audienceId);
  }

  public async loadJwks(audienceId: ApiServerId): Promise<JWKS> {
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

    // Check cache
    const cached = this.jwksCache.get(audienceId);
    if (cached && Date.now() - cached.fetchedAt < this.cache_ttl_ms) {
      if (this.debug) {
        console.log(
          `[RemoteJwtKeyManager] loadJwks(audience_id='${audienceId}') — cache hit`,
        );
      }
      return cached.jwks;
    }

    if (this.debug) {
      console.log(
        `[RemoteJwtKeyManager] loadJwks(audience_id='${audienceId}') — fetching from remote`,
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

    const jwks = await loadRemoteJwks({
      auth_server_uri: this.auth_server_uri,
      api_server_id: audienceId,
      jwks_access_private_key,
      debug: this.debug,
    });

    this.jwksCache.set(audienceId, { jwks, fetchedAt: Date.now() });

    return jwks;
  }
}

export default RemoteJwtKeyManager;
