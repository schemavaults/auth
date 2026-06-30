import { describe, expect, test } from "bun:test";
import generateNewJwtKeySet from "./generate_new_jwt_keyset";
import {
  SCHEMAVAULTS_AUTH_APP_ID,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

const DEBUG: boolean = false;

const environment: SchemaVaultsAppEnvironment = "test";

describe("Generate new JWT keyset", () => {
  test("should generate a new JWT keyset for auth server", async () => {
    const keyset = await generateNewJwtKeySet({
      audience_id: SCHEMAVAULTS_AUTH_APP_ID,
      environment,
    });
    expect(keyset).toBeDefined();
    expect(keyset.audience_id).toBe(SCHEMAVAULTS_AUTH_APP_ID);
    const keys = keyset.listSerializedKeys();
    expect(keys).toBeArrayOfSize(4);
    if (DEBUG) {
      console.log(keys);
    }
  });

  test("should generate a new JWT keyset for random API server", async () => {
    const api_server_id: string = crypto.randomUUID();

    const keyset = await generateNewJwtKeySet({
      audience_id: api_server_id,
      environment,
    });
    expect(keyset).toBeDefined();
    expect(keyset.audience_id).toBe(api_server_id);
    const keys = keyset.listSerializedKeys();
    expect(keys).toBeArrayOfSize(4);
    if (DEBUG) {
      console.log(keys);
    }
  });
});
