// A resource server whose JWKS download is refused (or whose JWKS access
// private key is unusable) cannot verify any token. The route guards must
// report a server misconfiguration: sending the user to /auth/login would
// mint another token that cannot be verified either, and the browser would
// loop between the protected page and the login flow.

import { describe, expect, mock, test } from "bun:test";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { generateNewJwtKeySet, JWT_Factory } from "@schemavaults/jwt";
import { NextRequest } from "next/server";
import type { ReactElement } from "react";
import { AccessTokenCookieName } from "@/AccessTokenCookieNames";
import {
  JwtKeyManagerMisconfigurationError,
  type IJwtKeyManager,
} from "@/JwtKeyManager";

const environment = "test" as const satisfies SchemaVaultsAppEnvironment;
const API_SERVER_ID = "misconfigured-resource-server";
const COOKIE = AccessTokenCookieName(API_SERVER_ID);

class RedirectSignal extends Error {
  public constructor(public readonly url: string) {
    super(`redirect(${url})`);
  }
}

const request_cookies = new Map<string, string>();
const real_headers = await import("next/headers");
const real_navigation = await import("next/navigation");
mock.module("next/headers", () => ({
  ...real_headers,
  cookies: async () => ({
    get: (name: string) =>
      request_cookies.has(name)
        ? { name, value: request_cookies.get(name) }
        : undefined,
  }),
}));
mock.module("next/navigation", () => ({
  ...real_navigation,
  redirect: (url: string): never => {
    throw new RedirectSignal(url);
  },
}));

const { withAuthenticatedServerComponentRouteGuard } = await import(
  "./withAuthenticatedServerComponentRouteGuard"
);
const { withAuthenticatedApiRouteGuard } = await import(
  "./withAuthenticatedApiRouteGuard"
);

async function mintAccessToken(): Promise<string> {
  const jwt_keys = await generateNewJwtKeySet({
    audience_id: API_SERVER_ID,
    environment,
  });
  const uid = crypto.randomUUID();
  const factory = new JWT_Factory({
    user: {
      uid,
      sub: uid,
      email: "misconfigured-resource-server@example.com",
      email_verified: true,
      created_at: Date.now(),
      admin: false,
      disabled: false,
    },
    client_app_id: API_SERVER_ID,
    jwt_keys,
    environment,
    user_organizations: [],
  });
  return (await factory.access(API_SERVER_ID)).token;
}

function failingKeysManager(error: Error): IJwtKeyManager {
  return {
    loadJwks: () => Promise.reject(error),
    isConfigured: () => true,
  };
}

const refused = (): JwtKeyManagerMisconfigurationError =>
  new JwtKeyManagerMisconfigurationError("jwks_download_refused", "refused", {
    status: 401,
  });
const unusable_key = (): JwtKeyManagerMisconfigurationError =>
  new JwtKeyManagerMisconfigurationError(
    "jwks_access_private_key_unusable",
    "unusable",
  );

async function serverComponentRedirect(keys_error: Error): Promise<string> {
  request_cookies.clear();
  request_cookies.set(COOKIE, await mintAccessToken());
  try {
    await withAuthenticatedServerComponentRouteGuard(
      async (): Promise<ReactElement> => {
        throw new Error("The protected page must not render");
      },
      undefined,
      {
        api_server_id: API_SERVER_ID,
        jwt_keys_manager: failingKeysManager(keys_error),
      },
    );
  } catch (e: unknown) {
    if (e instanceof RedirectSignal) return e.url;
    throw e;
  }
  throw new Error("Expected the route guard to redirect");
}

async function apiRouteStatus(keys_error: Error): Promise<number> {
  const handler = withAuthenticatedApiRouteGuard(
    async () => {
      throw new Error("The protected handler must not run");
    },
    undefined,
    {
      api_server_id: API_SERVER_ID,
      jwt_keys_manager: failingKeysManager(keys_error),
    },
  );
  const response = await handler(
    new NextRequest("https://resource.example.com/api/protected", {
      headers: { cookie: `${COOKIE}=${await mintAccessToken()}` },
    }),
  );
  return response.status;
}

describe("route guards on a resource server whose key manager is misconfigured", () => {
  test("the server component guard redirects to /auth/error with server_misconfiguration", async () => {
    for (const keys_error of [refused(), unusable_key()]) {
      expect(await serverComponentRedirect(keys_error)).toBe(
        "/auth/error?error=500&error_id=server_misconfiguration",
      );
    }
  });

  test("the server component guard still sends other key loading failures to the login page", async () => {
    expect(
      await serverComponentRedirect(new Error("503 Service Unavailable")),
    ).toBe("/auth/login");
  });

  test("the API route guard answers 500 instead of 401", async () => {
    expect(await apiRouteStatus(refused())).toBe(500);
    expect(await apiRouteStatus(unusable_key())).toBe(500);
    expect(await apiRouteStatus(new Error("503 Service Unavailable"))).toBe(
      401,
    );
  });
});
