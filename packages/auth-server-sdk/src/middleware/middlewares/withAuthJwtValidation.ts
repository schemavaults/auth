import type { NextResponse } from "next/server";
import {
  AuthMiddleware,
  type AuthMiddlewareResult,
  type AuthMiddlewareOptions,
  defaultAuthMiddlewareRules,
  determineAuthStatus,
  type AuthMiddlewareRules,
  type PotentiallyValidTokenSource,
  audienceSchema,
  type DecodeTokenFn,
  type AuthMiddlewareError,
} from "@schemavaults/auth-common";
import {
  type CustomJWTPayload,
  decodeJWT,
  type JWT_Keys,
} from "@schemavaults/jwt";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type {
  ISchemaVaultsMiddleware,
  ISchemaVaultsMiddlewareFactory,
  ISchemaVaultsMiddlewareFnInputs,
} from "@/middleware_types";
import { BaseMiddleware } from "@/middlewares/BaseMiddleware";
import loadJwtKeysFromEnv from "@/jwt/loadJwtKeysFromEnv";

export interface AuthJwtValidationMiddlewareOptions {
  audience: string;
  middleware_rules?: AuthMiddlewareRules;
  debug?: boolean;
  environment: SchemaVaultsAppEnvironment;
}

interface IAuthJwtValidationMiddlewareOpts
  extends AuthJwtValidationMiddlewareOptions {
  next: ISchemaVaultsMiddleware;
}

class AuthJwtValidationMiddleware
  extends BaseMiddleware
  implements ISchemaVaultsMiddleware
{
  private readonly audience: string;
  private readonly middleware_rules: AuthMiddlewareRules;

  public constructor({
    next,
    audience,
    ...opts
  }: IAuthJwtValidationMiddlewareOpts) {
    super({
      ...opts,
      name: "AuthJwtValidationMiddleware" as const,
      next,
    });

    if (typeof audience !== "string") {
      throw new Error(
        "AuthJwtValidationMiddleware did not receive an 'audience' to enforce for received JWTs!",
      );
    }

    this.audience = audience;
    this.middleware_rules = opts.middleware_rules ?? defaultAuthMiddlewareRules;
  }

  public async handle({
    req,
    json,
    redirect,
    ...inputs
  }: ISchemaVaultsMiddlewareFnInputs): Promise<NextResponse | Response> {
    const environment: SchemaVaultsAppEnvironment = this.environment;
    if (this.debug) {
      console.log(
        `[${this.name}] Running auth middleware on path: "${req.nextUrl.pathname}"`,
      );
    }

    if (req.cookies.size > 20) {
      console.error(`[${this.name}] Too many cookies: `, req.cookies.size);
      return json({
        error: true,
        success: false,
        message: "Too many cookies attached to request!"
      }, { status: 400 });
    }

    // Initialize array to store tokens from different sources
    const token_sources: PotentiallyValidTokenSource[] = [];

    // Load Tokens from cookies
    let refresh_token: string | undefined =
      req.cookies.get("refresh_token")?.value;
    let access_token: string | undefined =
      req.cookies.get("access_token")?.value;

    if (typeof refresh_token === "string") {
      token_sources.push({
        token: refresh_token,
        type: "refresh",
        sourceHint: "Refresh Token Cookie",
      });
    }

    if (typeof access_token === "string") {
      token_sources.push({
        token: access_token,
        type: "access",
        sourceHint: "Access Token Cookie",
      });
    }

    let authorizationHeaderToken: string | undefined = undefined;
    const authorizationHeader: string | null =
      req.headers.get("Authorization") ?? req.headers.get("authorization") ?? null;
    if (typeof authorizationHeader === "string") {
      const bearerPrefix = "Bearer " as const;
      if (authorizationHeader.startsWith(bearerPrefix)) {
        if (authorizationHeader.length > bearerPrefix.length) {
          const withoutPrefix: string = authorizationHeader.slice(
            bearerPrefix.length,
          );
          authorizationHeaderToken = withoutPrefix satisfies string;
        }
      }
    }

    if (typeof authorizationHeaderToken === "string") {
      token_sources.push({
        token: authorizationHeaderToken,
        type: "access",
        sourceHint: "Authorization Bearer Header Access Token",
      });
    }

    const jwt_audience = this.audience;
    const parsed_jwt_audience =
      await audienceSchema.safeParseAsync(jwt_audience);
    if (!parsed_jwt_audience.success) {
      console.error(parsed_jwt_audience.error);
      throw new Error(
        "[withAuthJwtValidation] Received invalid JWT audience to enforce!",
      );
    }

    let authStatus: AuthMiddlewareOptions["authStatus"];
    try {
      const baseAuthStatusDeterminationInputs = {
        client_type: "server" as const,
        app_env: this.environment,
        token_sources,
      } as const satisfies Partial<Parameters<typeof determineAuthStatus>[0]>;

      if (this.debug) {
        console.log(
          "[withAuthJwtValidation] Determining auth status with input options: ",
          baseAuthStatusDeterminationInputs,
        );
      }

      authStatus = await determineAuthStatus({
        ...baseAuthStatusDeterminationInputs,
        decodeJWT: async ({
          token,
          type,
          jwt_audience,
        }): Promise<Awaited<ReturnType<DecodeTokenFn>>> => {
          try {
            const jwt_keys: JWT_Keys = await loadJwtKeysFromEnv();
            const decoded: CustomJWTPayload = await decodeJWT({
              jwt: token,
              type,
              audience: jwt_audience,
              jwt_keys,
              env: environment,
            });
            return { ...decoded };
          } catch (e: unknown) {
            if (this.debug) {
              console.error(
                "[withAuthJwtValidation] Failed to decode JWT: ",
                e,
              );
            }
            throw new Error("Failed to decode JWT to determine auth status!");
          }
        },
        jwt_audience,
      });
    } catch (e: unknown) {
      console.error(
        "[withAuthJwtValidation] Middleware failed to determine authentication status: ",
        e,
      );
      throw new Error("Failed to determine authentication status!");
    }

    let authMiddlewareResult: AuthMiddlewareResult;
    try {
      authMiddlewareResult = AuthMiddleware({
        path: req.nextUrl.pathname,
        authStatus,
        rules: this.middleware_rules,
        authedOnUnauthedRouteRedirectTo: "/account" as const,
        unauthedOnAuthedRouteRedirectTo: "/auth/login" as const,
        authorize_uri: "/auth/authorize" as const,
        successful_logout_redirect_uri: "/" as const,
        environment: this.environment,
        debug: this.debug,
      });
      if (this.debug) {
        console.log(
          "[Middleware] Auth middleware result: ",
          authMiddlewareResult,
        );
        if (
          authMiddlewareResult &&
          authMiddlewareResult.remain &&
          req?.nextUrl?.pathname
        ) {
          console.log(
            "[Middleware] Not redirecting. Remaining on:",
            req.nextUrl.pathname,
          );
        }
      }
    } catch (e: unknown) {
      console.error("[Middleware] Error running auth middleware: ", e);
      return json(
        {
          success: false,
          message: "Error running auth middleware",
        },
        { status: 500 },
      );
    }

    if (authMiddlewareResult.remain) {
      const next = this.next;
      if (!AuthJwtValidationMiddleware.hasNextMiddleware(next)) {
        throw new Error(
          "Expected AuthJwtValidationMiddleware to have child middleware(s)!",
        );
      }
      return await next.handle({ req, json, redirect, ...inputs });
    } else {
      if (this.debug) {
        console.log("[Middleware] Not remaining on: ", req.nextUrl.pathname);
      }
    }

    if (authMiddlewareResult.redirect) {
      // Relative redirect path
      const relativeRedirectTo: string = authMiddlewareResult.redirectTo;

      const host: string = req.nextUrl.host;

      let protocol: "https" | "http" = "https";

      if (this.environment === "development" || this.environment === "test") {
        protocol = "http";
      }
      const redirectTo: string = protocol + "://" + host + relativeRedirectTo;
      if (this.environment === "development") {
        console.log('[Middleware] Redirecting to: "' + redirectTo + '"');
      }
      return redirect(redirectTo);
    }

    if (this.debug) {
      console.log(
        "[Middleware] Not remaining or redirecting on: ",
        req.nextUrl.pathname,
      );
    }

    if (authMiddlewareResult.error) {
      const errorType: AuthMiddlewareError = authMiddlewareResult.error;
      if (errorType === "Unauthorized") {
        return json(
          {
            error: "Unauthorized",
          },
          { status: 401 },
        );
      } else if (errorType === "Forbidden") {
        return json(
          {
            error: "Forbidden",
          },
          { status: 403 },
        );
      }

      console.error("Unknown auth middleware error: ", errorType);
      return json(
        {
          error: "Unknown auth middleware error",
        },
        { status: 500 },
      );
    }

    throw new Error("Unhandled auth middleware result");
  }
}

export class AuthJwtValidationMiddlewareFactory
  implements ISchemaVaultsMiddlewareFactory
{
  public readonly type = "middleware-factory" as const;

  private middlewareOpts: AuthJwtValidationMiddlewareOptions;

  public constructor(opts: AuthJwtValidationMiddlewareOptions) {
    this.middlewareOpts = opts;
  }

  public create(next: ISchemaVaultsMiddleware) {
    return new AuthJwtValidationMiddleware({
      ...this.middlewareOpts,
      next,
    });
  }
}

export default AuthJwtValidationMiddlewareFactory;
