import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { AuthMiddlewareRules } from "@schemavaults/auth-common";
import type { InitializeAuthClientOptions } from "@schemavaults/auth-client-sdk";
import type { useRouter } from "next/navigation";
import type { PropsWithChildren } from "react";
import type { AuthMiddlewareRulesBuilderFn } from "@/types/AuthMiddlewareRulesBuilderFn";
import type { OnLogoutCallback } from "@/contexts/on-logout-context";
import type { IAuthProviderRedirectUrlConfiguration } from "./IAuthProviderRedirectUrlConfiguration";

export interface SchemaVaultsAuthProviderProps
  extends PropsWithChildren, IAuthProviderRedirectUrlConfiguration {
  // Use a hardcoded auth server URI
  // if not supplied, this can be loaded from @schemavaults/app-definitions based on the environment
  auth_server_url?: string;

  app_id: AppId;

  /**
   * The auth server deployment's own app id (env-var driven for white-label
   * deployments, e.g. "acme-corp-auth"). Pass the value resolved server-side
   * by getAuthServerAppId() when mounting this provider on the auth server's
   * own frontend; external resource servers can omit it.
   * @default "schemavaults-auth"
   */
  auth_server_app_id?: AppId;

  router: ReturnType<typeof useRouter>;
  path: string;

  authMiddlewareRules?: AuthMiddlewareRules | AuthMiddlewareRulesBuilderFn;

  /**
   * A callback that can be called when logging out.
   * We already handle clearing all auth tokens from cookies or localStorage,
   * but this may be useful for clearing other authenticated state you've added
   * in your custom application. (E.g. clear SWR cache)
   * @default undefined
   */
  onLogout?: OnLogoutCallback;

  debug?: boolean;

  default_audiences?: InitializeAuthClientOptions["default_audiences"];

  autoreacquire_access_tokens?: boolean;

  environment: SchemaVaultsAppEnvironment;

  invite_code_required?: boolean;

  /**
   * Stop the auth client SDK from reporting the errors of its auth flows to
   * the auth server (`POST /api/client-errors/{app_id}`), and make
   * `reportError()` a no-op.
   * @default false
   */
  disable_telemetry?: boolean;

  /**
   * Path (or absolute URL) of the app's same-origin auth session route,
   * e.g. "/auth/session", served by `createAuthSessionRouteHandler()` from
   * `@schemavaults/auth-server-sdk/auth-session-route` (the
   * `auth-server-sdk codegen` CLI writes it). The SDK then redeems codes,
   * refreshes tokens, loads the user and logs out through it, and the
   * refresh token lives in an HTTP-only cookie on the app's own domain:
   * never readable by the page's scripts, and first-party, so browsers that
   * block third-party cookies (Safari, every iOS browser) keep it.
   */
  session_route_uri?: string;

  fetch: (url: string, init: RequestInit | undefined) => Promise<Response>;
}
