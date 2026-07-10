import { describe, expect, test } from "bun:test";
import { DEFAULT_AUTH_SERVER_APP_ID } from "@schemavaults/app-definitions";
import { RemoteAllowedOriginsResolver } from "./RemoteAllowedOriginsResolver";

const AUTH_SERVER_URL = "https://auth.example.com";

// Overrides the network + env seams so tests exercise only the caching logic.
class TestableRemoteAllowedOriginsResolver extends RemoteAllowedOriginsResolver {
  public fetchCallCount = 0;

  public constructor(
    private readonly origins: readonly string[],
    cache_ttl_ms?: number,
    private readonly failFirstNFetches: number = 0,
    private readonly fetchDelayMs: number = 0,
  ) {
    super({ auth_server_url: AUTH_SERVER_URL, cache_ttl_ms });
  }

  protected override async loadJwksAccessPrivateKey(): Promise<CryptoKey> {
    return {} as CryptoKey;
  }

  protected override async fetchOrigins(): Promise<readonly string[]> {
    this.fetchCallCount++;
    if (this.fetchDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.fetchDelayMs));
    }
    if (this.fetchCallCount <= this.failFirstNFetches) {
      throw new Error("simulated fetch failure");
    }
    return this.origins;
  }
}

/** Unique per-test API server ids keep the static cache from leaking between tests. */
let testCounter = 0;
function uniqueApiServerId(): string {
  testCounter++;
  return `00000000-0000-4000-8000-${String(testCounter).padStart(12, "0")}`;
}

describe("RemoteAllowedOriginsResolver", () => {
  test("fetches once and serves the second call from cache", async () => {
    const resolver = new TestableRemoteAllowedOriginsResolver([
      "https://app.example.com",
    ]);
    const api_server_id = uniqueApiServerId();

    const first = await resolver.loadAllowedOrigins(api_server_id);
    const second = await resolver.loadAllowedOrigins(api_server_id);

    expect(first).toEqual(["https://app.example.com"]);
    expect(second).toEqual(["https://app.example.com"]);
    expect(resolver.fetchCallCount).toBe(1);
  });

  test("refetches after the cache TTL expires", async () => {
    const resolver = new TestableRemoteAllowedOriginsResolver(
      ["https://app.example.com"],
      1, // 1ms TTL
    );
    const api_server_id = uniqueApiServerId();

    await resolver.loadAllowedOrigins(api_server_id);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await resolver.loadAllowedOrigins(api_server_id);

    expect(resolver.fetchCallCount).toBe(2);
  });

  test("invalidateAllowedOriginsCache forces a refetch", async () => {
    const resolver = new TestableRemoteAllowedOriginsResolver([
      "https://app.example.com",
    ]);
    const api_server_id = uniqueApiServerId();

    await resolver.loadAllowedOrigins(api_server_id);
    resolver.invalidateAllowedOriginsCache(api_server_id);
    await resolver.loadAllowedOrigins(api_server_id);

    expect(resolver.fetchCallCount).toBe(2);
  });

  test("shares the cache across resolver instances", async () => {
    const api_server_id = uniqueApiServerId();
    const first = new TestableRemoteAllowedOriginsResolver([
      "https://app.example.com",
    ]);
    const second = new TestableRemoteAllowedOriginsResolver([
      "https://other.example.com",
    ]);

    await first.loadAllowedOrigins(api_server_id);
    const fromSecondInstance = await second.loadAllowedOrigins(api_server_id);

    expect(fromSecondInstance).toEqual(["https://app.example.com"]);
    expect(second.fetchCallCount).toBe(0);
  });

  test("dedupes concurrent fetches for the same audience", async () => {
    const resolver = new TestableRemoteAllowedOriginsResolver(
      ["https://app.example.com"],
      undefined,
      0,
      10, // slow fetch so both calls overlap
    );
    const api_server_id = uniqueApiServerId();

    const [first, second] = await Promise.all([
      resolver.loadAllowedOrigins(api_server_id),
      resolver.loadAllowedOrigins(api_server_id),
    ]);

    expect(first).toEqual(["https://app.example.com"]);
    expect(second).toEqual(["https://app.example.com"]);
    expect(resolver.fetchCallCount).toBe(1);
  });

  test("rejects the auth server app id", async () => {
    const resolver = new TestableRemoteAllowedOriginsResolver([]);
    await expect(
      resolver.loadAllowedOrigins(DEFAULT_AUTH_SERVER_APP_ID),
    ).rejects.toThrow();
  });

  test("rejects an invalid api_server_id", async () => {
    const resolver = new TestableRemoteAllowedOriginsResolver([]);
    await expect(
      resolver.loadAllowedOrigins("not a valid id!!!"),
    ).rejects.toThrow();
  });

  test("propagates fetch errors without caching them", async () => {
    const resolver = new TestableRemoteAllowedOriginsResolver(
      ["https://app.example.com"],
      undefined,
      1, // first fetch fails
    );
    const api_server_id = uniqueApiServerId();

    await expect(resolver.loadAllowedOrigins(api_server_id)).rejects.toThrow(
      "simulated fetch failure",
    );

    // The failure is not cached: the next call retries and succeeds...
    const retried = await resolver.loadAllowedOrigins(api_server_id);
    expect(retried).toEqual(["https://app.example.com"]);
    expect(resolver.fetchCallCount).toBe(2);

    // ...and the success IS cached.
    await resolver.loadAllowedOrigins(api_server_id);
    expect(resolver.fetchCallCount).toBe(2);
  });
});
