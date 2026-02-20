import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { AuthMiddlewareRules } from "@schemavaults/auth-common";
import type { InitializeAuthClientOptions } from "@schemavaults/auth-client-sdk";
import type { useRouter } from "next/navigation";
import type { PropsWithChildren } from "react";

export interface SchemaVaultsAuthProviderProps extends PropsWithChildren {
  // Use a hardcoded auth server URI
  // if not supplied, this can be loaded from @schemavaults/app-definitions based on the environment
  auth_server_uri?: string;

  app_id: AppId;

  router: ReturnType<typeof useRouter>;
  path: string;

  authMiddlewareRules?: AuthMiddlewareRules;
  authed_on_unauthed_redirect_uri: string;
  unauthed_on_authed_redirect_uri: string;

  successful_authentication_redirect_uri?: string;
  successful_logout_redirect_uri?: string;
  authorize_uri?: string;

  debug?: boolean;

  default_audiences?: InitializeAuthClientOptions["default_audiences"];

  autoreacquire_access_tokens?: boolean;

  environment: SchemaVaultsAppEnvironment;

  invite_code_required?: boolean;

  fetch: (url: string, init: RequestInit | undefined) => Promise<Response>;
}
