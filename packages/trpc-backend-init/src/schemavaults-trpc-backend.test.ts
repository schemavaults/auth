import { describe, expect, test } from "bun:test";
import { SchemaVaults_tRPC_Backend } from "./schemavaults-trpc-backend";
import type { Base_SchemaVaults_tRPC_Resources } from "./context";
import type { SchemaVaults_tRPC_Runtime } from "./schemavaults-trpc-runtime";
import type { SchemaVaults_tRPC_Procedures } from "./procedures";

class TestBackend extends SchemaVaults_tRPC_Backend<Base_SchemaVaults_tRPC_Resources> {
  get trpc(): SchemaVaults_tRPC_Runtime<Base_SchemaVaults_tRPC_Resources> {
    return this._trpc;
  }
  get procedures(): SchemaVaults_tRPC_Procedures<Base_SchemaVaults_tRPC_Resources> {
    return this._trpc_procedures;
  }
}

describe("SchemaVaults_tRPC_Backend", () => {
  test("should create a router without throwing", () => {
    const backend = new TestBackend();
    const router = backend.router({
      health: backend.procedures.public.query(() => ({ ok: true })),
    });
    expect(router).toBeDefined();
  });
});
