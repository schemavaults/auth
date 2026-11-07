import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { AuthMiddlewareRules } from "@schemavaults/auth-common";
import type {
  AuthorizationParams,
  AuthSessionRoutes,
  InitializeAuthClientOptions,
} from "@schemavaults/auth-client-sdk";
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

  /**
   * The authorization request every sign-in makes (`scope`, RFC 8707
   * `resource`), wherever it starts: the `/auth/login` and `/auth/register`
   * pages, the auth middleware, the app's own `login()` / `register()` calls
   * (whose own `scope` / `resource` win). Set it to ask for your API's scopes
   * at sign-in, e.g. a first-party app whose tokens must carry the scopes of
   * its own API:
   *
   * ```tsx
   * <AuthProvider
   *   default_audiences={["my-notes-api"]}
   *   authorization_params={{
   *     scope: "openid email profile notes:read notes:write",
   *     resource: "my-notes-api",
   *   }}
   * />
   * ```
   *
   * A signed-in session whose sign-in asked for less (one that predates the
   * scopes you list, e.g. after you add one) is sent through the
   * authorization flow again, once per tab, from the page it is on: the auth
   * server asks for no password while its own session lasts, and its consent
   * screen lists only the scopes the user has not granted yet. Keep the value
   * stable (define it at module level).
   * @default { scope: "openid email profile" } (no resource)
   */
  authorization_params?: AuthorizationParams;

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
   * The app's same-origin auth session routes, each by its own path (or
   * absolute URL), e.g. `AUTH_SESSION_ROUTE_PATHS` where the
   * `auth-server-sdk codegen` CLI writes them, served by the route factories
   * of `@schemavaults/auth-server-sdk/auth-session-route`. The SDK then
   * redeems codes and refreshes tokens through `token`, loads the user
   * through `whoami` and logs out through `logout`, and the refresh token
   * lives in an HTTP-only cookie on the app's own domain: never readable by
   * the page's scripts, and first-party, so browsers that block third-party
   * cookies (Safari, every iOS browser) keep it.
   */
  session_routes?: AuthSessionRoutes;

  fetch: (url: string, init: RequestInit | undefined) => Promise<Response>;
}
