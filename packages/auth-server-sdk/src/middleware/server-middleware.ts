import {
  type AuthMiddlewareRules,
  StorageRegionID,
  appRefIdSchema,
  baseStorageRegionIdSchema,
  fsServerAudienceIdSchema,
} from "@schemavaults/auth";
import {
  type IMiddlewareChainInitOptions,
  MiddlewareChain,
} from "@/middleware_chain";
import type { NextResponse } from "next/server";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

/** Middlewares Imports */
import { AuthJwtValidationMiddlewareFactory } from "@/middlewares/withAuthJwtValidation";
import {
  type SchemaVaultsCORSEnforcementPolicy,
  CorsMiddlewareFactory,
  SchemaVaultsCORSEnforcementPolicies as cors_policies,
} from "@/middlewares/withCorsSettings";
import { RequestLoggingMiddlewareFactory } from "@/middlewares/withLogging";
import type {
  ISchemaVaultsMiddleware,
  ISchemaVaultsMiddlewareFactory,
  ISchemaVaultsMiddlewareFnInputs,
} from "./middleware_types";
import { BaseMiddleware } from "@/middlewares/BaseMiddleware";

export interface IServerMiddlewareInitializationOptions {
  api_server_id?: string;
  vault_fs_server_region_id?: string;
  auth_middleware_rules?: AuthMiddlewareRules;
  debug?: boolean;
  cors_policy?: SchemaVaultsCORSEnforcementPolicy;
  environment?: SchemaVaultsAppEnvironment;
}

export class SchemaVaultsServerMiddleware
  extends BaseMiddleware
  implements ISchemaVaultsMiddleware
{
  private static assertEitherAndNotBothApiServerAndFsServerOpts(
    opts: IServerMiddlewareInitializationOptions,
  ): void {
    // assert not both
    if (!!opts.api_server_id && !!opts.vault_fs_server_region_id) {
      throw new Error(
        "You may not supply both 'api_server_id' and 'vault_fs_server_region_id' options to SchemaVaultsServerMiddleware!",
      );
    }
    // assert at least one supplied
    if (!opts.api_server_id && !opts.vault_fs_server_region_id) {
      throw new Error(
        "You must supply either an 'api_server_id' or 'vault_fs_server_region_id' option to SchemaVaultsServerMiddleware!",
      );
    }

    if (!!opts.api_server_id && typeof opts.api_server_id !== "string") {
      throw new Error("Expected 'api_server_id' option to be a string!");
    } else if (
      !!opts.vault_fs_server_region_id &&
      typeof opts.vault_fs_server_region_id !== "string"
    ) {
      throw new Error(
        "Expected 'vault_fs_server_region_id' option to be a string!",
      );
    }
  }

  private static determineJwtAudienceFromConstructorOptions(
    opts: IServerMiddlewareInitializationOptions,
  ): string {
    SchemaVaultsServerMiddleware.assertEitherAndNotBothApiServerAndFsServerOpts(
      opts,
    );
    console.assert(
      (!!opts.api_server_id || !!opts.vault_fs_server_region_id) &&
        !(!!opts.api_server_id && !!opts.vault_fs_server_region_id),
      "Expected either 'api_server_id' or 'vault_fs_server_region_id' to be defined if this point was reached",
    );
    if (!!opts.api_server_id) {
      const parsed_api_server_id = appRefIdSchema.safeParse(opts.api_server_id);
      if (!parsed_api_server_id.success) {
        console.error(
          "Error parsing API server ID to initialize SchemaVaultsServerMiddleware with: ",
          parsed_api_server_id.error,
        );
        throw new Error(
          "Error parsing API server ID to initialize SchemaVaultsServerMiddleware with!",
        );
      }
      const api_server_id: string = parsed_api_server_id.data;
      return api_server_id;
    } else if (!!opts.vault_fs_server_region_id) {
      const parsed_storage_region_id = baseStorageRegionIdSchema.safeParse(
        opts.vault_fs_server_region_id,
      );
      if (!parsed_storage_region_id.success) {
        console.error(
          "Error parsing vault filesystem server storage region ID to initialize SchemaVaultsServerMiddleware with: ",
          parsed_storage_region_id.error,
        );
        throw new Error(
          "Error parsing vault filesystem server storage region ID to initialize SchemaVaultsServerMiddleware with!",
        );
      }
      const storage_region_id: StorageRegionID = parsed_storage_region_id.data;

      const jwt_audience_for_storage_region_id: string = `schemavaults-fs:${storage_region_id}`;
      if (
        !fsServerAudienceIdSchema.safeParse(jwt_audience_for_storage_region_id)
          .success
      ) {
        throw new Error(
          "Failed to determine JWT audience for vault filesystem server from 'vault_fs_server_region_id' input option to SchemaVaultsServerMiddleware!",
        );
      }

      return jwt_audience_for_storage_region_id;
    } else {
      // this should not be reached-- already asserted that either api server id or storage region id was passed
      throw new Error(
        "Error in determineJwtAudienceFromConstructorOptions logic!",
      );
    }
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
    const audience: string =
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
