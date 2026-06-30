import type { ICacheableJwtKeyManager } from "@/JwtKeyManager/ICacheableJwtKeyManager";
import type { JWKS } from "@schemavaults/jwt";
import loadRemoteJwks from "./loadRemoteJwks";
import {
  type ApiServerId,
  apiServerIdSchema,
  SCHEMAVAULTS_AUTH_APP_ID,
} from "@schemavaults/app-definitions";
import getSchemaVaultsAuthServerUri from "@/env/get-schemavaults-auth-server-url";
import loadJwksAccessPrivateKey, {
  JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME,
} from "@/env/loadJwksAccessPrivateKey";

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface IJwksCacheEntry {
  jwks: JWKS;
  fetchedAt: number;
}

export interface IRemoteJwtKeyManagerConstructorOpts {
  auth_server_url?: string;
  debug?: boolean;
  cache_ttl_ms?: number;
}

export class RemoteJwtKeyManager implements ICacheableJwtKeyManager {
  private readonly auth_server_url: string;
  private readonly debug: boolean;
  private readonly cache_ttl_ms: number;
  private static readonly jwksCache: Map<string, IJwksCacheEntry> = new Map();

  public constructor({
    auth_server_url = getSchemaVaultsAuthServerUri(),
    ...opts
  }: IRemoteJwtKeyManagerConstructorOpts) {
    this.auth_server_url = auth_server_url;
    this.debug = typeof opts.debug === "boolean" ? opts.debug : false;
    this.cache_ttl_ms =
      typeof opts.cache_ttl_ms === "number" && opts.cache_ttl_ms > 0
        ? opts.cache_ttl_ms
        : DEFAULT_CACHE_TTL_MS;
  }

  private cacheKey(audienceId: string): string {
    return `${this.auth_server_url}::${audienceId}`;
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

  protected async loadJwksAccessPrivateKey(): Promise<CryptoKey> {
    let jwks_access_private_key: CryptoKey;
    try {
      jwks_access_private_key = await loadJwksAccessPrivateKey(process.env);
    } catch (e: unknown) {
      console.error(e);
      throw new TypeError(
        "Failed to load JWKS access private key from environment variables!",
      );
    }
    return jwks_access_private_key;
  }

  public async loadJwks(audienceId: ApiServerId): Promise<JWKS> {
    if (!apiServerIdSchema.safeParse(audienceId).success) {
      throw new Error(
        `Invalid audience to load remote JWKS for: '${audienceId}'`,
      );
    }

    if (audienceId === SCHEMAVAULTS_AUTH_APP_ID) {
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

    const jwks_access_private_key = await this.loadJwksAccessPrivateKey();

    if (this.debug) {
      console.log(
        `[RemoteJwtKeyManager] loadJwks(audience_id='${audienceId}') — fetching from remote (cacheKey='${key}')`,
      );
    }

    const jwks = await loadRemoteJwks({
      auth_server_url: this.auth_server_url,
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
