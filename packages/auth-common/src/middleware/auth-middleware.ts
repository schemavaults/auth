import {
  type NavigationPath,
  parseNavigationPath,
} from "./parse-navigation-path";
import {
  evaluateAuthMiddlewareRules,
  type AuthMiddlewareRules,
  type AuthenticationStatus,
} from "./middleware-rules";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { AuthMiddlewareError } from "./auth-middleware-error";

export interface AuthMiddlewareOptions {
  /** The current path, e.g. /vaults/my-vault */
  path: string;
  /** Is the user logged in? */
  authStatus: AuthenticationStatus;
  /** Define what routes are public/unauthed/authed */
  rules: AuthMiddlewareRules;
  /** Where the user should be sent if they are logged in on a page for unauthenticated users */
  authedOnUnauthedRouteRedirectTo: string;
  /** Where the user should be sent if they are not logged in on a page for authenticated users */
  unauthedOnAuthedRouteRedirectTo: string;
  /** Page which handles authorizing an unauthorized user via search params */
  authorize_uri: string;
  /** Page which users should be sent to after successfully logging out */
  successful_logout_redirect_uri?: string;
  /** App Environment. This can usually be loaded from the env without passing it explicitly... but it might throw if not ¯\_(ツ)_/¯ */
  environment: SchemaVaultsAppEnvironment;
  /** Enable debug logging. Defaults to 'true' in non-production environments. */
  debug?: boolean;
}

export type AuthMiddlewareResult =
  | {
      redirect: false;
      remain: true;
    }
  | {
      redirect: true;
      remain: false;
      redirectTo: string;
    }
  | {
      redirect: false;
      error: AuthMiddlewareError;
      remain: undefined;
    };

export function AuthMiddleware({
  path,
  authStatus,
  rules,
  authedOnUnauthedRouteRedirectTo,
  unauthedOnAuthedRouteRedirectTo,
  authorize_uri,
  successful_logout_redirect_uri,
  environment,
  ...opts
}: AuthMiddlewareOptions): AuthMiddlewareResult {
  // Determine environment
  if (!environment) {
    throw new TypeError(
      "[AuthMiddleware] Did not receive an 'environment' input option!",
    );
  }

  let debug: boolean = false;
  if (typeof opts.debug === "boolean") {
    debug = opts.debug;
  } else {
    if (
      environment === "development" ||
      environment === "test" ||
      environment === "staging"
    ) {
      debug = true;
    }
  }

  if (typeof path !== "string") {
    throw new Error("AuthMiddleware: path must be a string.");
  }

  const isAuthorizePage: boolean = path.startsWith(authorize_uri);

  const parsedPath: NavigationPath = parseNavigationPath(path);
  if (debug) {
    console.log(
      '[AuthMiddleware] Running auth middleware on path: "/' +
        parsedPath.join("/") +
        '"',
    );
    console.log(`[AuthMiddleware] Current authentication status:`, authStatus);
    console.log("[AuthMiddleware] Rules: ", rules);
  }

  // Redirect from the logout page if a URL was supplied
  if (typeof successful_logout_redirect_uri === "string") {
    const isLogoutPage: boolean =
      parsedPath.length === 2 &&
      parsedPath[0] == "auth" &&
      parsedPath[1] == "logout";

    if (isLogoutPage && authStatus.status === "logged-out") {
      return {
        redirect: true,
        redirectTo: successful_logout_redirect_uri,
        remain: false,
      };
    }
  }

  const middlewareRuleDetermination = evaluateAuthMiddlewareRules(
    parsedPath,
    authStatus,
    rules,
    environment,
  );

  if (debug) {
    console.log(
      "[AuthMiddleware] Middleware situation reducer evaluation: ",
      middlewareRuleDetermination,
    );
  }

  // A basic sanity check on the result of evaluateAuthMiddlewareRules
  if (
    middlewareRuleDetermination.length !== 3 ||
    middlewareRuleDetermination[1] !== "on"
  ) {
    throw new Error("AuthMiddleware: Invalid middleware rule determination.");
  }

  if (middlewareRuleDetermination[0] === "logged-in") {
    if (debug) {
      console.log(
        "[AuthMiddleware] Reccommending redirect to: ",
        authedOnUnauthedRouteRedirectTo,
      );
    }
    if (isAuthorizePage) {
      return {
        redirect: true,
        remain: false,
        redirectTo: authedOnUnauthedRouteRedirectTo,
      };
    }

    switch (middlewareRuleDetermination[2]) {
      case "public":
        if (debug) {
          console.log(
            `[AuthMiddleware] Recommending remain on page: /${parsedPath.join("/")}`,
          );
        }
        return {
          redirect: false,
          remain: true,
        };
      case "unauthed":
        if (debug) {
          console.log(
            `[AuthMiddleware] Recommending redirect to page: `,
            authedOnUnauthedRouteRedirectTo,
            ` ( from current url: ${parsedPath.join(", ")})`,
          );
        }
        return {
          redirect: true,
          remain: false,
          redirectTo: authedOnUnauthedRouteRedirectTo,
        };
      case "authed":
        if (debug) {
          console.log(
            `[AuthMiddleware] Recommending remain on page: /${parsedPath.join("/")}`,
          );
        }
        return {
          redirect: false,
          remain: true,
        };
      case "api": {
        if (debug) {
          console.log(
            `[AuthMiddleware] Recommending API request to pass-through: /${parsedPath.join("/")}`,
          );
        }
        return {
          redirect: false,
          remain: true,
        };
      }
      case "admin": {
        if (authStatus.status === "logged-in" && authStatus.admin) {
          if (debug) {
            console.log(
              `[AuthMiddleware] Recommending admin remain on page: /${parsedPath.join("/")}`,
            );
          }
          return {
            redirect: false,
            remain: true,
          };
        } else if (authStatus.status === "logged-in") {
          return {
            redirect: true,
            remain: false,
            redirectTo: authedOnUnauthedRouteRedirectTo,
          };
        } else {
          authStatus.status satisfies "logged-out";
          return {
            redirect: true,
            remain: false,
            redirectTo: unauthedOnAuthedRouteRedirectTo,
          };
        }
      }
      default:
        throw new Error("AuthMiddleware: Invalid page security level.");
    }
  } else {
    // logged-out
    switch (middlewareRuleDetermination[2]) {
      case "public":
        if (debug) {
          console.log(
            `[AuthMiddleware] Recommending remain on page: /${parsedPath.join("/")}`,
          );
        }
        return {
          redirect: false,
          remain: true,
        };
      case "unauthed":
        if (debug) {
          console.log(
            `[AuthMiddleware] Recommending remain on page: /${parsedPath.join("/")}`,
          );
        }
        return {
          redirect: false,
          remain: true,
        };
      case "authed":
        if (debug) {
          console.log(
            `[AuthMiddleware] Recommending redirect to page: }`,
            unauthedOnAuthedRouteRedirectTo,
          );
        }
        return {
          redirect: true,
          remain: false,
          redirectTo: unauthedOnAuthedRouteRedirectTo,
        };
      case "admin":
        if (debug) {
          console.log(
            `[AuthMiddleware] Recommending redirect to page: }`,
            unauthedOnAuthedRouteRedirectTo,
          );
        }
        return {
          redirect: true,
          remain: false,
          redirectTo: unauthedOnAuthedRouteRedirectTo,
        };
      case "api":
        return {
          redirect: false,
          remain: undefined,
          error: "Unauthorized",
        };
      default:
        throw new Error("AuthMiddleware: Invalid page security level.");
    }
  }
}
