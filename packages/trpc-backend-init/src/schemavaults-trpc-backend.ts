// schemavaults-trpc-backend.ts

import { initTRPC, lazy } from "@trpc/server";
import {
  createContext,
  type ICreateContextFnOptions,
  type Base_SchemaVaults_tRPC_Resources,
  type SchemaVaults_tRPC_Context,
} from "./context";
import type { SchemaVaults_tRPC_Runtime } from "@/schemavaults-trpc-runtime";
import {
  createProcedures,
  type SchemaVaults_tRPC_Procedures,
} from "./procedures";

export abstract class SchemaVaults_tRPC_Backend<
  R extends Base_SchemaVaults_tRPC_Resources,
> {
  protected _trpc: SchemaVaults_tRPC_Runtime<R>;
  protected _trpc_procedures: ReturnType<typeof createProcedures<R>>;

  public constructor() {
    // tRPC should only be initialized ONCE per server, so we initialize it here.
    this._trpc = initTRPC.context<SchemaVaults_tRPC_Context<R>>().create();
    this._trpc_procedures = createProcedures<R>(
      this._trpc.middleware,
      this._trpc.procedure,
    );
  }

  public abstract get trpc(): SchemaVaults_tRPC_Runtime<R>;

  public abstract get procedures(): SchemaVaults_tRPC_Procedures<R>;

  public get router(): SchemaVaults_tRPC_Runtime<R>["router"] {
    return this.trpc.router;
  }

  /**
   * @name lazy
   * @description Lazy load a tRPC backend router
   */
  public get lazy() {
    return lazy;
  }

  /**
   * @name createContext
   * @description Initialize tRPC context accessible to procedures
   */
  public async createContext(
    opts: ICreateContextFnOptions<R>,
  ): Promise<SchemaVaults_tRPC_Context<R>> {
    return await createContext(opts);
  }
}
