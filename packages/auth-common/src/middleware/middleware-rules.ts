import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { comparePath } from "./compare-path";
import type { NavigationPath } from "./parse-navigation-path";
import { z } from "zod";

// Every requires authentication by default, unless it is in the public list or the unauthed list.
// An unauthed route is a route that is only accessible to unauthenticated users.
// (i.e. redirect users from the login/register pages)


export const pageSecurityLevelSchema = z.enum(
  ['public', 'unauthed', 'authed', 'admin', 'api'] as const
);
type PageSecurityLevel = z.infer<typeof pageSecurityLevelSchema>;

export type AuthMiddlewareRules = Record<PageSecurityLevel, NavigationPath[]>;

export const authenticationStatusSchema = z.union([
  z.object({
    status: z.literal('logged-in'),
    admin: z.boolean().optional(),
  }).required({
    status: true
  }).strict(),
  z.object({
    status: z.literal('logged-out'),
  }).required({ status: true }).strict(),
] as const)

export type AuthenticationStatus = z.infer<typeof authenticationStatusSchema>;

function isAuthenticationStatus(value: unknown): value is AuthenticationStatus {
  return authenticationStatusSchema.safeParse(value).success;
}

type AuthMiddlewareResult = readonly [AuthenticationStatus['status'], 'on', PageSecurityLevel];

export function evaluateAuthMiddlewareRules(
  // The current path (which the middleware is being run on)
  currentPath: NavigationPath,
  // The current authentication status of the user (logged in or logged out)
  authStatus: AuthenticationStatus,
  // The rules for the middleware to follow, given the current path and authentication status
  rules: AuthMiddlewareRules,
  // App Environment (enables additional debug logging)
  environment: SchemaVaultsAppEnvironment = getAppEnvironment()
): AuthMiddlewareResult {
  if (environment === 'development') {
    console.log("[AuthMiddleware] Evaluating current path against redirect rules...")
  }

  if (!isAuthenticationStatus(authStatus)) {
    throw new Error("authStatus must be either 'logged-in' or 'logged-out'");
  }

  // Get the page security level
  const defaultPageSecurityLevel = 'authed' as const satisfies PageSecurityLevel;
  let pageSecurityLevel: PageSecurityLevel = defaultPageSecurityLevel;
  try {
    if (environment === 'development') {
      console.log("[AuthMiddleware] Current path: ", currentPath);
      try {
        console.log("[AuthMiddleware] Rules: ", rules)
      } catch (e: unknown) { void e; /** no-op */ }
    }
    if (rules.public.some(
      (route: NavigationPath): boolean => {
        const isMatch: boolean = comparePath(currentPath, route);
        if (environment === 'test' && isMatch) {
          console.log(`[AuthMiddleware] Current path "${currentPath.join("/")}" matches public route: `, route);
        }
        return isMatch;
      }
    )) {
      // Current path matches a public route rule
      pageSecurityLevel = 'public';
    } else if (rules.unauthed.some(
      (route: NavigationPath): boolean => {
        const isMatch: boolean = comparePath(currentPath, route);
        if (environment === 'test' && isMatch) {
          console.log(`[AuthMiddleware] Current path "${currentPath.join("/")}" matches unauthed route: `, route);
        }
        return isMatch;
      }
    )) {
      // Current path matches an unauthed route rule
      pageSecurityLevel = 'unauthed';
    } else if (rules.authed?.some(
      (route: NavigationPath): boolean => {
        const isMatch: boolean = comparePath(currentPath, route);
        if (environment === 'test' && isMatch) {
          console.log(`[AuthMiddleware] Current path "${currentPath.join("/")}" matches authed route: `, route);
        }
        return isMatch;
      }
    )) {
      // Current path matches an authed route rule
      pageSecurityLevel = 'authed';
    } else if (rules.api.some(
      (route: NavigationPath): boolean => {
        const isMatch: boolean = comparePath(currentPath, route);
        if (environment === 'test' && isMatch) {
          console.log(`[AuthMiddleware] Current path "${currentPath.join("/")}" matches api route: `, route);
        }
        return isMatch;
      }
    )) {
      pageSecurityLevel = 'api';
    } else {
      if (environment === 'development') {
        console.log(`[AuthMiddleware] Current path "${currentPath.join("/")}" does not match any route rule-- treating as 'authed' by default`);
      }
      pageSecurityLevel = 'authed';
    }
  } catch (e: unknown) {
    /** default to authed, but log the error */
    console.error(e);
    pageSecurityLevel = defaultPageSecurityLevel satisfies 'authed';
  }

  return [authStatus.status, 'on', pageSecurityLevel] as const;
};
