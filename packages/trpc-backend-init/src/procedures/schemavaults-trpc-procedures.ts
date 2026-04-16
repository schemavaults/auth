import type { Base_SchemaVaults_tRPC_Resources } from "@/context";
import type { createProcedures } from "./create_procedures";

export type SchemaVaults_tRPC_Procedures<
  R extends Base_SchemaVaults_tRPC_Resources,
> = ReturnType<typeof createProcedures<R>>;
