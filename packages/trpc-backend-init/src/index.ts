import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: SchemaVaultsAppEnvironment;
    }
  }
}

export { SchemaVaults_tRPC_Backend } from "./schemavaults-trpc-backend";

export type {
  SchemaVaults_tRPC_Context,
  ICreateContextFnOptions,
  CreateContextFn,
  Base_SchemaVaults_tRPC_Resources,
} from "./context";

export type { SchemaVaults_tRPC_Runtime } from "./schemavaults-trpc-runtime";
export type { SchemaVaults_tRPC_Procedures } from "./procedures";
