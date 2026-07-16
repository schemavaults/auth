// route-guard-factory.ts

import AdminRequiredRouteGuard from "./admin";
import AuthenticationRequiredRouteGuard from "./authenticated";
import type { IRouteGuard } from "./IRouteGuard";
import { z } from "zod";
import type { InitRouteGuardCheckOptions } from "./init_route_guard_check_options";
import type { PotentiallyValidTokenSource } from "@schemavaults/auth-common";
import {
  type ApiServerId,
  apiServerIdSchema,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { RemoteJwtKeyManager, type IJwtKeyManager } from "@/JwtKeyManager";
import getSchemaVaultsAuthServerUri from "@/env/get-schemavaults-auth-server-url";
import decodeJWTsWithKeyManager from "@/decode-jwts-with-key-manager";

/**
 * Constructor options for {@link RouteGuardFactory}.
 */
export interface RouteGuardFactoryInitOptions {
  /**
   * The deployment environment (e.g. `development`, `staging`, `production`)
   * the factory is operating in. Used to validate the `iss`/audience of
   * incoming JWTs against the expected auth server for that environment.
   */
  environment: SchemaVaultsAppEnvironment;
  /**
   * The JWT key manager used to fetch the signing keys needed to verify
   * tokens.
   *
   * - **Required** when {@link RouteGuardFactoryInitOptions.is_auth_server} is
   *   `true` (the auth server must supply its own local key manager).
   * - **Optional** for resource servers: when omitted, a
   *   {@link RemoteJwtKeyManager} is created that loads keys remotely from the
   *   auth server (resolved via `getSchemaVaultsAuthServerUri()`).
   */
  jwt_keys_manager?: IJwtKeyManager;
  /**
   * Set to `true` only when this factory runs inside the auth server itself.
   * When `true`, a {@link RouteGuardFactoryInitOptions.jwt_keys_manager} must
   * be provided. Defaults to `false` (i.e. a remote resource server).
   */
  is_auth_server?: boolean;
  /**
   * When `true`, the factory and the guards it creates emit verbose
   * `console.log` diagnostics. Defaults to `false`.
   */
  debug?: boolean;
}

const GUARD_TYPES = [
  "authenticated",
  "admin",
] as const satisfies readonly string[];

type RouteGuardType = (typeof GUARD_TYPES)[number];
const validGuardTypeSchema = z.string().refine((str): str is RouteGuardType => {
  return (
    GUARD_TYPES satisfies readonly string[] as readonly string[]
  ).includes(str);
});

const GUARDS = {
  authenticated: (opts) => new AuthenticationRequiredRouteGuard(opts),
  admin: (opts) => new AdminRequiredRouteGuard(opts),
} as const satisfies Record<
  RouteGuardType,
  (opts: InitRouteGuardCheckOptions) => IRouteGuard
>;

/**
 * Factory for constructing {@link IRouteGuard} instances that protect API
 * routes and server components.
 *
 * A guard verifies the caller's identity (and, depending on the guard type,
 * their privileges) before a protected handler runs. The factory exposes
 * several entry points depending on what you already have in hand:
 *
 * - {@link RouteGuardFactory.createGuardFromOptions} — you already have a
 *   decoded user (no token verification performed).
 * - {@link RouteGuardFactory.createGuardFromTokenSources} — you have one or
 *   more raw tokens to verify.
 * - {@link RouteGuardFactory.createGuardFromAuthHeader} — you have a raw HTTP
 *   `Authorization` header value to parse and verify.
 *
 * Guard types currently supported: `"authenticated"` (any signed-in user) and
 * `"admin"` (signed-in users with admin privileges).
 */
export class RouteGuardFactory {
  private readonly jwt_keys_manager: IJwtKeyManager;
  private readonly environment: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;
  private readonly is_auth_server: boolean;

  public constructor({ environment, ...opts }: RouteGuardFactoryInitOptions) {
    this.environment = environment;
    this.debug = opts.debug ?? false;
    if (
      typeof opts.is_auth_server !== "boolean" &&
      typeof opts.is_auth_server !== "undefined"
    ) {
      throw new TypeError("Invalid value for 'is_auth_server'");
    }
    this.is_auth_server = opts.is_auth_server ?? false;

    if (opts.jwt_keys_manager) {
      if (this.debug) {
        console.log(
          "[RouteGuardFactory] Using custom 'jwt_keys_manager' from constructor options!",
        );
      }
      this.jwt_keys_manager = opts.jwt_keys_manager;
    } else {
      if (this.is_auth_server) {
        throw new TypeError(
          "An argument for 'jwt_keys_manager' is required when 'is_auth_server' is true",
        );
      }
      if (this.debug) {
        console.log(
          "[RouteGuardFactory] Creating default 'jwt_keys_manager' for remote resource server (loads keys from auth server)!",
        );
      }
      this.jwt_keys_manager = new RemoteJwtKeyManager({
        auth_server_url: getSchemaVaultsAuthServerUri(),
        debug: this.debug,
      });
    }
  }

  private static isValidRouteGuardType(type: unknown): type is RouteGuardType {
    if (typeof type !== "string") return false;
    return validGuardTypeSchema.safeParse(type).success;
  }

  /**
   * Construct a guard directly from an already-resolved user/options object,
   * without performing any token verification.
   *
   * Prefer {@link RouteGuardFactory.createGuardFromTokenSources} or
   * {@link RouteGuardFactory.createGuardFromAuthHeader} unless you have already
   * decoded and trust the user yourself.
   *
   * @param type - Which guard to build: `"authenticated"` or `"admin"`.
   * @param opts - The resolved check options (notably the decoded `user`).
   * @returns The constructed {@link IRouteGuard}.
   * @throws {Error} If `type` is not a recognized guard type.
   */
  public static createGuardFromOptions(
    type: RouteGuardType,
    opts: InitRouteGuardCheckOptions,
  ): IRouteGuard {
    if (!RouteGuardFactory.isValidRouteGuardType(type)) {
      throw new Error(
        `Invalid route guard type, should be one of: ${GUARD_TYPES.join(", ")}`,
      );
    }
    const GUARD_LOADER = GUARDS[type];
    const GUARD: IRouteGuard = GUARD_LOADER(opts);

    return GUARD;
  }

  /**
   * Instance-level convenience wrapper around the static
   * {@link RouteGuardFactory.createGuardFromOptions}.
   *
   * @param type - Which guard to build: `"authenticated"` or `"admin"`.
   * @param opts - The resolved check options (notably the decoded `user`).
   * @returns The constructed {@link IRouteGuard}.
   * @throws {Error} If `type` is not a recognized guard type.
   */
  public createGuardFromOptions(
    type: RouteGuardType,
    opts: InitRouteGuardCheckOptions,
  ): IRouteGuard {
    return RouteGuardFactory.createGuardFromOptions(type, opts);
  }

  /**
   * Verify one or more raw tokens and, on success, construct the requested
   * guard for the decoded user.
   *
   * Each entry in `token_sources` is a candidate token (e.g. an access token
   * pulled from a header or cookie); they are decoded/verified via the
   * configured JWT key manager and the first valid one resolves the user.
   *
   * @param type - Which guard to build: `"authenticated"` or `"admin"`.
   * @param token_sources - Candidate tokens to verify. Pass the **raw token
   *   strings only** — do not include a `"Bearer "` prefix here (see
   *   {@link RouteGuardFactory.createGuardFromAuthHeader} if you have a full
   *   `Authorization` header).
   * @param jwt_audience - The expected JWT audience (`aud`), i.e. the
   *   {@link ApiServerId} of the resource server the token must be scoped to.
   * @returns The constructed {@link IRouteGuard}.
   * @throws {TypeError} If `jwt_audience` is not a valid API server ID.
   * @throws {Error} If no JWT key manager is available, or none of the tokens
   *   verify successfully.
   */
  public async createGuardFromTokenSources(
    type: RouteGuardType,
    token_sources: readonly PotentiallyValidTokenSource[],
    jwt_audience: ApiServerId,
  ): Promise<IRouteGuard> {
    if (this.debug) {
      console.log(
        `[RouteGuardFactory] Initializing route guard from token sources: `,
        token_sources,
      );
    }

    if (!apiServerIdSchema.safeParse(jwt_audience satisfies string).success) {
      throw new TypeError(
        `Invalid API server ID for 'jwt_audience': ${jwt_audience}`,
      );
    }

    if (!this.jwt_keys_manager) {
      throw new Error(
        "Failed to resolve reference to JWT keys manager to operate this route guard!",
      );
    }

    const decoded = await decodeJWTsWithKeyManager(
      this.jwt_keys_manager,
      token_sources,
      jwt_audience,
      this.environment,
      this.debug,
    );

    const init_opts: InitRouteGuardCheckOptions = {
      user: decoded.user,
      // Thread the token's granted scope alongside the user (null when no
      // user was resolved or the token carried no scope claim).
      scope: decoded.user ? decoded.scope : null,
      environment: getAppEnvironment(),
    };

    if (this.debug) {
      console.log(
        `[RouteGuardFactory] Creating route guard with init options: `,
        init_opts,
      );
    }

    return this.createGuardFromOptions(type, init_opts) satisfies IRouteGuard;
  }

  /**
   * Parse a raw HTTP `Authorization` header, verify the bearer token it
   * carries, and construct the requested guard for the decoded user.
   *
   * @param type - Which guard to build: `"authenticated"` or `"admin"`.
   * @param authHeader - The **full `Authorization` header value, including the
   *   `"Bearer "` prefix** — e.g. `"Bearer eyJhbGci..."`, exactly as read from
   *   `request.headers.get("authorization")`. The prefix is stripped
   *   internally before the token is verified; passing a bare token (without
   *   the prefix) will throw. `null` is accepted (and rejected) so callers can
   *   forward a missing header directly.
   * @param jwt_audience - The expected JWT audience (`aud`), i.e. the
   *   {@link ApiServerId} of the resource server the token must be scoped to.
   * @returns The constructed {@link IRouteGuard}.
   * @throws {Error} If `authHeader` is missing/empty or does not start with the
   *   `"Bearer "` prefix.
   * @throws {Error} If the extracted token fails verification (propagated from
   *   {@link RouteGuardFactory.createGuardFromTokenSources}).
   *
   * @example
   * ```ts
   * const guard = await factory.createGuardFromAuthHeader(
   *   "authenticated",
   *   request.headers.get("authorization"), // "Bearer eyJ..."
   *   "my-api-server-id",
   * );
   * ```
   */
  public async createGuardFromAuthHeader(
    type: RouteGuardType,
    authHeader: string | null,
    jwt_audience: string,
  ): Promise<IRouteGuard> {
    if (!authHeader || typeof authHeader !== "string") {
      throw new Error("No auth header found");
    }
    const bearerPrefix = "Bearer " as const;
    if (!authHeader.startsWith(bearerPrefix)) {
      throw new Error("Auth header should have a 'Bearer' prefix");
    }
    const token: string = authHeader.slice(bearerPrefix.length);

    return await this.createGuardFromTokenSources(
      type,
      [
        {
          sourceHint: "Auth Header Access Token",
          token,
          type: "access",
        },
      ],
      jwt_audience,
    );
  }
}

export default RouteGuardFactory;
