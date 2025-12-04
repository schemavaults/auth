// server-middleware.ts

import type {
   AuthMiddlewareRules,
} from "@schemavaults/auth-common";
import {
  type IMiddlewareChainInitOptions,
  MiddlewareChain,
} from "@/middleware_chain";
import type { NextResponse } from "next/server";
import {
  type ApiServerId,
  apiServerIdSchema,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

/** Middlewares Imports */
import AuthJwtValidationMiddlewareFactory from "@/middlewares/withAuthJwtValidation";
import CorsMiddlewareFactory, {
  type SchemaVaultsCORSEnforcementPolicy,
  SchemaVaultsCORSEnforcementPolicies as cors_policies,
} from "@/middlewares/withCorsSettings";
import RequestLoggingMiddlewareFactory from "@/middlewares/withLogging";
import type {
  ISchemaVaultsMiddleware,
  ISchemaVaultsMiddlewareFactory,
  ISchemaVaultsMiddlewareFnInputs,
} from "./middleware_types";
import BaseMiddleware from "@/middlewares/BaseMiddleware";

export interface IServerMiddlewareInitializationOptions {
  api_server_id?: string;
  auth_middleware_rules?: AuthMiddlewareRules;
  debug?: boolean;
  cors_policy?: SchemaVaultsCORSEnforcementPolicy;
  environment?: SchemaVaultsAppEnvironment;
}

export class SchemaVaultsServerMiddleware
  extends BaseMiddleware
  implements ISchemaVaultsMiddleware
{

  private static isValidApiServerId(api_server_id: unknown): api_server_id is ApiServerId {
    if (!api_server_id) {
      console.error("[SchemaVaultsServerMiddleware] Did not receive a 'api_server_id' (falsy!) to initialize middleware with!")
      throw new TypeError("Did not receive a valid API server ID!")
    }
    const parsed_api_server_id = apiServerIdSchema.safeParse(api_server_id);
    if (!parsed_api_server_id.success) {
      console.error(
        "Error parsing API server ID to initialize SchemaVaultsServerMiddleware with: ",
        parsed_api_server_id.error,
      );
      throw new TypeError(
        "Error parsing API server ID to initialize SchemaVaultsServerMiddleware with!",
      );
    }
    return parsed_api_server_id.success
  }

  private static determineJwtAudienceFromConstructorOptions(
    opts: IServerMiddlewareInitializationOptions,
  ): string {
    if (!SchemaVaultsServerMiddleware.isValidApiServerId(opts.api_server_id)) {
      throw new TypeError("Invalid 'api_server_id' for server middleware!")
    }

    return opts.api_server_id satisfies ApiServerId;
  }

  private static getDefaultCorsPolicy(
    environment: SchemaVaultsAppEnvironment,
  ): SchemaVaultsCORSEnforcementPolicy {
    if (environment === "development") {
      return cors_policies.AllowAny;
    }
    return cors_policies.EnforceValidAppIfOriginApplied;
  }

  private static setupMiddlewareChain(
    opts: IServerMiddlewareInitializationOptions,
  ): ISchemaVaultsMiddleware {
    const audience: ApiServerId =
      SchemaVaultsServerMiddleware.determineJwtAudienceFromConstructorOptions(
        opts,
      );

    const environment: SchemaVaultsAppEnvironment =
      opts.environment ?? getAppEnvironment();

    const debug: boolean =
      typeof opts.debug === "boolean"
        ? opts.debug
        : environment === "development" ||
          environment === "test" ||
          environment === "staging";

    const cors_policy: SchemaVaultsCORSEnforcementPolicy =
      opts.cors_policy ??
      SchemaVaultsServerMiddleware.getDefaultCorsPolicy(environment);

    const middlewareChainOpts: IMiddlewareChainInitOptions = {
      middlewares: [
        new RequestLoggingMiddlewareFactory(),
        new CorsMiddlewareFactory({
          debug: debug,
          audience,
          policy: cors_policy,
        }),
        new AuthJwtValidationMiddlewareFactory({
          audience,
          middleware_rules: opts.auth_middleware_rules,
          debug: debug,
          environment: environment,
        }),
      ] as const satisfies readonly ISchemaVaultsMiddlewareFactory[],
      debug,
    };

    return new MiddlewareChain(middlewareChainOpts);
  }

  public constructor(readonly options: IServerMiddlewareInitializationOptions) {
    super({
      ...options,
      name: "SchemaVaultsServerMiddleware",
      next: SchemaVaultsServerMiddleware.setupMiddlewareChain(options),
    });

    if (this.debug) {
      console.log(
        `[SchemaVaultsServerMiddleware] Initialized! (audience: ${options.api_server_id}). Middleware Chain: `,
        this.toMiddlewareFlowString(),
      );
    }
  }

  public async handle({
    req,
    ...inputs
  }: ISchemaVaultsMiddlewareFnInputs): Promise<NextResponse | Response> {
    const next = this.next;
    if (!next) {
      throw new Error("Failed to load SchemaVaults middleware handler!");
    }
    return await next.handle({ req, ...inputs });
  }
}
