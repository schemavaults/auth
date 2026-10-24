import { describe, expect, test } from "bun:test";
import { DEFAULT_AUTH_SERVER_APP_ID } from "@schemavaults/app-definitions";
import { SchemaVaultsAuthClient } from "@/auth-client";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

const APP_ORIGIN = "https://app.example.com";

/** A client whose adapter keeps the flow's values in memory. */
function createClient(options: { app_id?: string; storesNextHref?: boolean } = {}) {
  const redirects: string[] = [];
  const next_hrefs = new Map<number, string>();
  const challenge_times: number[] = [];
  const adapter = {
    redirect: (uri: string): void => {
      redirects.push(uri);
    },
    relativeUrlToAbsoluteUrl: (relative: string): string => new URL(relative, APP_ORIGIN).toString(),
    toBase64UrlFromBytes: (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url"),
    storeCodeVerifier: (_verifier: string, challenge_time: number): void => {
      challenge_times.push(challenge_time);
    },
    storeOAuth2State: (): void => {},
    storeOidcNonce: (): void => {},
    ...(options.storesNextHref === false
      ? {}
      : {
          storeNextHref: (next_href: string, challenge_time: number): void => {
            next_hrefs.set(challenge_time, next_href);
          },
          loadNextHref: (challenge_time: number): string | null => next_hrefs.get(challenge_time) ?? null,
          clearNextHref: (challenge_time: number): void => {
            next_hrefs.delete(challenge_time);
          },
        }),
    getUserData: () => null,
    hasRefreshToken: (): boolean => false,
    getRefreshToken: () => null,
    uuid: (): string => crypto.randomUUID(),
  } as unknown as ISchemaVaultsAuthClientAdapter;

  const client = new SchemaVaultsAuthClient({
    adapter,
    auth_server_url: "https://auth.example.com",
    successful_authentication_redirect_uri: "/account",
    authorize_uri: "/auth/authorize",
    app_id: options.app_id ?? "my-web-app",
    app_env: "production",
    debug: false,
    disable_telemetry: true,
  });
  return { client, redirects, next_hrefs, challenge_times };
}

describe("login({ next_href })", () => {
  test("keeps next_href for the flow and hands it back once", async () => {
    const { client, redirects, next_hrefs, challenge_times } = createClient();
    await client.login({ next_href: "/admin/keys?tab=scopes" });

    expect(redirects).toHaveLength(1);
    // The destination stays in the browser: it is not sent to the auth server.
    expect(redirects[0]).not.toContain("admin");
    const challenge_time = challenge_times[0]!;
    expect(next_hrefs.get(challenge_time)).toBe("/admin/keys?tab=scopes");

    expect(client.consumeNextHref(challenge_time)).toBe("/admin/keys?tab=scopes");
    expect(client.consumeNextHref(challenge_time)).toBeNull();
  });

  test("register() keeps next_href too", async () => {
    const { client, challenge_times } = createClient();
    await client.register({ next_href: "/admin" });
    expect(client.consumeNextHref(challenge_times[0]!)).toBe("/admin");
  });

  test("drops unsafe destinations and the sign-in flow's own pages", async () => {
    for (const next_href of ["https://evil.example/phish", "//evil.example", "/auth/login"]) {
      const { client, next_hrefs, challenge_times } = createClient();
      await client.login({ next_href });
      expect(next_hrefs.size).toBe(0);
      expect(client.consumeNextHref(challenge_times[0]!)).toBeNull();
    }
  });

  test("stores nothing without next_href", async () => {
    const { client, next_hrefs } = createClient();
    await client.login();
    expect(next_hrefs.size).toBe(0);
  });

  test("still signs in with an adapter that cannot store next_href", async () => {
    const { client, redirects, challenge_times } = createClient({ storesNextHref: false });
    await client.login({ next_href: "/admin" });
    expect(redirects).toHaveLength(1);
    expect(client.consumeNextHref(challenge_times[0]!)).toBeNull();
  });

  test("forgets next_href once the flow has expired", async () => {
    const { client, next_hrefs } = createClient();
    const expired_challenge_time = Date.now() - 24 * 60 * 60 * 1000;
    next_hrefs.set(expired_challenge_time, "/admin");
    expect(client.consumeNextHref(expired_challenge_time)).toBeNull();
    expect(next_hrefs.size).toBe(0);
  });

  test("the auth server's own client forwards next_href to its login page", async () => {
    const { client, redirects } = createClient({ app_id: DEFAULT_AUTH_SERVER_APP_ID });
    await client.login({ next_href: "/admin/users" });
    await client.register({ next_href: "https://evil.example" });
    expect(redirects).toEqual(["/auth/login?next_href=%2Fadmin%2Fusers", "/auth/register"]);
  });
});
