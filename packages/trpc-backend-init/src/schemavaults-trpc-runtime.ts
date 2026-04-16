import type { initTRPC } from "@trpc/server";
import type {
  Base_SchemaVaults_tRPC_Resources,
  SchemaVaults_tRPC_Context,
} from "./context";

type BuilderContext<R extends Base_SchemaVaults_tRPC_Resources> = ReturnType<
  typeof initTRPC.context<SchemaVaults_tRPC_Context<R>>
>;

export type SchemaVaults_tRPC_Runtime<
  R extends Base_SchemaVaults_tRPC_Resources,
> = ReturnType<BuilderContext<R>["create"]>;
