import type { IAllowedOriginsResolver } from "./IAllowedOriginsResolver";
import loadRemoteAllowedOrigins from "./loadRemoteAllowedOrigins";
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

interface IOriginsCacheEntry {
  origins: readonly string[];
  fetchedAt: number;
}

export interface IRemoteAllowedOriginsResolverConstructorOpts {
  auth_server_url?: string;
  debug?: boolean;
  cache_ttl_ms?: number;
}

export class RemoteAllowedOriginsResolver implements IAllowedOriginsResolver {
  private readonly auth_server_url: string;
  private readonly debug: boolean;
  private readonly cache_ttl_ms: number;
  private static readonly originsCache: Map<string, IOriginsCacheEntry> =
    new Map();
  // Unlike the JWKS cache, this lookup runs on every cross-origin request,
  // so concurrent misses must share one fetch (and one single-use proof
  // token) instead of each minting their own.
  private static readonly inFlight: Map<
    string,
    Promise<readonly string[]>
  > = new Map();

  public constructor({
    auth_server_url = getSchemaVaultsAuthServerUri(),
    ...opts
  }: IRemoteAllowedOriginsResolverConstructorOpts) {
    this.auth_server_url = auth_server_url;
    this.debug = typeof opts.debug === "boolean" ? opts.debug : false;
    this.cache_ttl_ms =
      typeof opts.cache_ttl_ms === "number" && opts.cache_ttl_ms > 0
        ? opts.cache_ttl_ms
        : DEFAULT_CACHE_TTL_MS;
  }

  private cacheKey(api_server_id: string): string {
    return `${this.auth_server_url}::${api_server_id}`;
  }

  public invalidateAllowedOriginsCache(api_server_id: string): void {
    const key = this.cacheKey(api_server_id);
    if (this.debug) {
      console.log(
        `[RemoteAllowedOriginsResolver] invalidateAllowedOriginsCache(api_server_id='${api_server_id}', cacheKey='${key}')`,
      );
    }
    RemoteAllowedOriginsResolver.originsCache.delete(key);
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

  protected async fetchOrigins(
    api_server_id: ApiServerId,
    jwks_access_private_key: CryptoKey,
  ): Promise<readonly string[]> {
    return await loadRemoteAllowedOrigins({
      auth_server_url: this.auth_server_url,
      api_server_id,
      jwks_access_private_key,
      debug: this.debug,
    });
  }

  public async loadAllowedOrigins(
    api_server_id: ApiServerId,
  ): Promise<readonly string[]> {
    if (!apiServerIdSchema.safeParse(api_server_id).success) {
      throw new Error(
        `Invalid API server ID to load allowed origins for: '${api_server_id}'`,
      );
    }

    if (api_server_id === SCHEMAVAULTS_AUTH_APP_ID) {
      throw new Error(
        `Auth server doesn't load allowed origins remotely; it already has database access.`,
      );
    }

    // Check static cache (shared across all instances)
    const key = this.cacheKey(api_server_id);
    const cached = RemoteAllowedOriginsResolver.originsCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.cache_ttl_ms) {
      if (this.debug) {
        console.log(
          `[RemoteAllowedOriginsResolver] loadAllowedOrigins(api_server_id='${api_server_id}') — cache hit (cacheKey='${key}')`,
        );
      }
      return cached.origins;
    }

    const inFlight = RemoteAllowedOriginsResolver.inFlight.get(key);
    if (inFlight) {
      if (this.debug) {
        console.log(
          `[RemoteAllowedOriginsResolver] loadAllowedOrigins(api_server_id='${api_server_id}') — joining in-flight fetch (cacheKey='${key}')`,
        );
      }
      return await inFlight;
    }

    if (this.debug) {
      console.log(
        `[RemoteAllowedOriginsResolver] loadAllowedOrigins(api_server_id='${api_server_id}') — fetching from remote (cacheKey='${key}')`,
      );
    }

    const fetchPromise: Promise<readonly string[]> = (async () => {
      const jwks_access_private_key = await this.loadJwksAccessPrivateKey();
      const origins = await this.fetchOrigins(
        api_server_id,
        jwks_access_private_key,
      );
      RemoteAllowedOriginsResolver.originsCache.set(key, {
        origins,
        fetchedAt: Date.now(),
      });
      return origins;
    })();
    RemoteAllowedOriginsResolver.inFlight.set(key, fetchPromise);
    try {
      // Errors propagate to the caller and are NOT cached; the next request
      // retries the fetch.
      return await fetchPromise;
    } finally {
      RemoteAllowedOriginsResolver.inFlight.delete(key);
    }
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

export default RemoteAllowedOriginsResolver;
