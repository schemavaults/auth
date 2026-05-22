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
  auth_server_uri?: string;

  app_id: AppId;

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

  fetch: (url: string, init: RequestInit | undefined) => Promise<Response>;
}
