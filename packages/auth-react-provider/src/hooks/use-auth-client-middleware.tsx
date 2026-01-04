"use client";

import {
  AuthMiddleware,
  type AuthMiddlewareOptions,
  determineAuthStatus,
  type AuthMiddlewareRules,
  type RefreshToken,
  type PotentiallyValidTokenSource,
  type UserData,
} from "@schemavaults/auth-common";
import type { useRouter } from "next/navigation";
import {
  type OnAuthStateChangedHandlerInput,
  useAuthClientStateWatcher,
} from "./use-auth-client-state-watcher";
import {
  useAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "./use-app-environment";
import { useDebugWithSpecifiedBooleanOrLookupDefault } from "./use-debug";

export type UseAuthClientMiddlewareOptions = {
  router: ReturnType<typeof useRouter>;
  authMiddlewareRules: AuthMiddlewareRules;
  path: string;
  authed_on_unauthed_redirect_uri: string;
  unauthed_on_authed_redirect_uri: string;
  authorize_uri: string;
  successful_logout_redirect_uri?: string;
  debug?: boolean;
};

export function useAuthClientMiddleware(
  opts: UseAuthClientMiddlewareOptions,
): void {
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const debug: boolean = useDebugWithSpecifiedBooleanOrLookupDefault(
    environment,
    opts.debug,
  );

  async function onAuthStateChangedRunMiddleware({
    auth,
    debug,
  }: OnAuthStateChangedHandlerInput): Promise<void> {
    console.assert(
      !!window,
      "'window' should be defined here-- but it's not! ",
    );

    if (!opts.authMiddlewareRules) {
      throw new Error(
        "[onAuthStateChangedRunMiddleware] authMiddlewareRules is required.",
      );
    }

    if (!opts.path) {
      throw new Error("[onAuthStateChangedRunMiddleware] path is required.");
    }

    if (auth) {
      const refreshToken: RefreshToken | null = auth.getRefreshTokenFromCache();

      let refresh_token: string | undefined = undefined;
      if (refreshToken && refreshToken.exp > Date.now()) {
        refresh_token = refreshToken.token;
      }

      const token_sources: PotentiallyValidTokenSource[] = [];

      let user_data: UserData | undefined = undefined;
      if (auth.currentUser) {
        user_data = auth.currentUser ?? undefined;
      }

      if (typeof refresh_token === "string") {
        token_sources.push({
          type: "refresh",
          token: refresh_token,
          sourceHint: "Refresh token",
        });
      }

      const authStatus: AuthMiddlewareOptions["authStatus"] =
        await determineAuthStatus({
          token_sources,
          user_data,
          client_type: "client",
          debug,
        });

      if (debug) {
        console.log(
          `[onAuthStateChangedRunMiddleware]` +
            " " +
            `Running auth middleware after Auth SDK state change, on path ${opts.path}, with rules: `,
          opts.authMiddlewareRules,
        );
      }

      const authorize_uri: string = opts.authorize_uri;

      const authMiddlewareResult = AuthMiddleware({
        path: opts.path,
        authStatus,
        rules: opts.authMiddlewareRules,
        authedOnUnauthedRouteRedirectTo: opts.authed_on_unauthed_redirect_uri,
        unauthedOnAuthedRouteRedirectTo: opts.unauthed_on_authed_redirect_uri,
        authorize_uri,
        successful_logout_redirect_uri: opts.successful_logout_redirect_uri,
        environment,
      } satisfies AuthMiddlewareOptions);

      if (debug) {
        console.log(
          `[onAuthStateChangedRunMiddleware] Auth SDK State Change Event Auth middleware result: `,
          authMiddlewareResult,
        );
      }

      if (authMiddlewareResult.redirect) {
        if (debug) {
          console.log(
            `[onAuthStateChangedRunMiddleware] ` +
              `Redirecting to: ${authMiddlewareResult.redirectTo} (from ${
                window.location.origin
              } @ ${opts.path})`,
          );
        }
        opts.router.push(authMiddlewareResult.redirectTo);
        return;
      }
    }
  }

  useAuthClientStateWatcher({
    onAuthStateChanged: onAuthStateChangedRunMiddleware,
    debug,
  });
}
