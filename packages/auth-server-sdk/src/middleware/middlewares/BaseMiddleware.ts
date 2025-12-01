import type {
  ISchemaVaultsMiddleware,
  ISchemaVaultsMiddlewareFnInputs,
} from "@/middleware_types";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { NextResponse } from "next/server";

export interface IBaseMiddlewareInitOptions {
  next: ISchemaVaultsMiddleware | undefined;
  name: string;
  debug?: boolean;
  environment?: SchemaVaultsAppEnvironment;
}

export abstract class BaseMiddleware implements ISchemaVaultsMiddleware {
  protected readonly next: ISchemaVaultsMiddleware | undefined;
  public readonly name: string;
  public readonly type = "middleware" as const;
  private readonly _debug: boolean;
  private readonly _environment: SchemaVaultsAppEnvironment;

  protected get debug(): boolean {
    return this._debug;
  }

  protected get environment(): SchemaVaultsAppEnvironment {
    return this._environment;
  }

  protected static hasNextMiddleware(
    next: ISchemaVaultsMiddleware | undefined,
  ): next is ISchemaVaultsMiddleware {
    if (!!next && next.type === "middleware") return true;
    return false;
  }

  public get height(): number {
    if (!this.next) return 0;
    return this.next.height + 1;
  }

  protected constructor(opts: IBaseMiddlewareInitOptions) {
    this.name = opts.name;
    if (opts.next) {
      if (
        typeof opts.next.type !== "string" ||
        opts.next.type !== "middleware"
      ) {
        throw new Error(
          "Expected 'next' to be a SchemaVaults middleware instance, but the 'type' property was not equal to 'middleware'!",
        );
      }
    }
    this.next = opts.next;
    const environment: SchemaVaultsAppEnvironment =
      opts.environment ?? getAppEnvironment();
    this._environment = environment;
    this._debug =
      typeof opts.debug === "boolean"
        ? opts.debug
        : environment === "development" ||
          environment === "test" ||
          environment === "staging";
  }

  public abstract handle(
    inputs: ISchemaVaultsMiddlewareFnInputs,
  ): Promise<NextResponse | Response>;

  public toMiddlewareFlowString(): string {
    const next: ISchemaVaultsMiddleware | undefined = this.next;
    if (!next) {
      return `"${this.name}"` as const;
    } else {
      return `"${this.name}" -> ${next.toMiddlewareFlowString()}` as const;
    }
  }
}

export default BaseMiddleware;
