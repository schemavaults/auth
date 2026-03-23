import type { ICacheableJwtKeyManager } from "@/JwtKeyManager/ICacheableJwtKeyManager";
import type { JWKS } from "@schemavaults/jwt";
import loadRemoteJwks from "./loadRemoteJwks";
import {
  type ApiServerId,
  apiServerIdSchema,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
} from "@schemavaults/app-definitions";
import getSchemaVaultsAuthServerUri from "@/get-schemavaults-auth-server-uri";
import loadJwksAccessPrivateKey, {
  JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME,
} from "@/env/loadJwksAccessPrivateKey";

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
  private static readonly jwksCache: Map<string, IJwksCacheEntry> = new Map();

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

  private cacheKey(audienceId: string): string {
    return `${this.auth_server_uri}::${audienceId}`;
  }

  public invalidateJwksCache(audienceId: string): void {
    const key = this.cacheKey(audienceId);
    if (this.debug) {
      console.log(
        `[RemoteJwtKeyManager] invalidateJwksCache(audience_id='${audienceId}', cacheKey='${key}')`,
      );
    }
    RemoteJwtKeyManager.jwksCache.delete(key);
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

    // Check static cache (shared across all instances)
    const key = this.cacheKey(audienceId);
    const cached = RemoteJwtKeyManager.jwksCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.cache_ttl_ms) {
      if (this.debug) {
        console.log(
          `[RemoteJwtKeyManager] loadJwks(audience_id='${audienceId}') — cache hit (cacheKey='${key}')`,
        );
      }
      return cached.jwks;
    }

    if (this.debug) {
      console.log(
        `[RemoteJwtKeyManager] loadJwks(audience_id='${audienceId}') — fetching from remote (cacheKey='${key}')`,
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

    RemoteJwtKeyManager.jwksCache.set(key, { jwks, fetchedAt: Date.now() });

    return jwks;
  }

  public isConfigured(): boolean {
    if (
      typeof process.env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME] === "string" &&
      process.env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME].length > 0
    ) {
      return true;
    }
    return false;
  }
}

export default RemoteJwtKeyManager;
