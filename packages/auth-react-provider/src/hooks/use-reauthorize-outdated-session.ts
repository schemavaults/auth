"use client";

import { useEffect } from "react";
import {
  type AuthorizationParams,
  type ISchemaVaultsAuthClient,
  formatScope,
  resolveNextHref,
} from "@schemavaults/auth-client-sdk";
import useAuth from "@/hooks/use-auth";
import useAppId from "@/hooks/use-app-id";

const ATTEMPT_STORAGE_KEY_PREFIX = "schemavaults_reauthorization_attempt" as const;

/**
 * Claims this tab's one automatic re-authorization for these authorization
 * params. A sign-in that is abandoned, or whose request could not be
 * recorded, must not bounce the user through the flow on every page load.
 */
function claimReauthorizationAttempt(
  app_id: string,
  authorization_params: AuthorizationParams,
): boolean {
  const key = `${ATTEMPT_STORAGE_KEY_PREFIX}_${app_id}`;
  // The scope's wire form, so a list of definitions and the equivalent
  // string are the same request.
  const value: string = JSON.stringify({
    scope:
      authorization_params.scope === undefined
        ? null
        : formatScope(authorization_params.scope),
    resource: authorization_params.resource ?? null,
  });
  try {
    if (window.sessionStorage.getItem(key) === value) {
      return false;
    }
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    // Without sessionStorage there is no loop guard: do not redirect.
    return false;
  }
}

/**
 * @name useReauthorizeOutdatedSession
 * @description Sends a signed-in user whose session's sign-in asked for less
 * than the app's `authorization_params` (`auth.needsReauthorization()`, e.g.
 * a session from before the app asked for its API's scopes) through the
 * authorization flow again, back to the page they are on. At most once per
 * tab for the same params, and never from the sign-in flow's own pages
 * (`/auth/*`). The auth server asks for no password while its own session
 * lasts; its consent screen lists the scopes the user has not granted yet.
 * Mounted by `<AuthProvider>` when `authorization_params` is set.
 */
export function useReauthorizeOutdatedSession({
  path,
  authorization_params,
  debug = false,
}: {
  /** The current path (re-checked on navigation). */
  path: string;
  authorization_params: AuthorizationParams;
  debug?: boolean;
}): void {
  const authContext = useAuth();
  const app_id: string = useAppId();

  useEffect(() => {
    if (!authContext.ready) return;
    const auth: ISchemaVaultsAuthClient | null = authContext.client.current;
    if (!auth || !auth.isAuthenticated || !auth.needsReauthorization()) return;
    const next_href: string | null = resolveNextHref(
      `${path}${window.location.search}`,
    );
    if (!next_href) return; // a sign-in flow page: it finishes the flow itself
    if (!claimReauthorizationAttempt(app_id, authorization_params)) return;
    if (debug) {
      console.log(
        "[useReauthorizeOutdatedSession] The session predates the app's authorization_params; authorizing again from: ",
        next_href,
      );
    }
    auth.login({ next_href }).catch((e: unknown): void => {
      console.error(
        "[useReauthorizeOutdatedSession] Failed to start the authorization flow: ",
        e,
      );
    });
  }, [authContext, app_id, path, authorization_params, debug]);
}

export default useReauthorizeOutdatedSession;
