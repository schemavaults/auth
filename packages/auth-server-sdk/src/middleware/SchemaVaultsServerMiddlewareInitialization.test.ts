import { test, describe, expect } from "bun:test";
import {
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  SCHEMAVAULTS_MAIL_APP_DEFINITION,
} from "@schemavaults/app-definitions";
import SchemaVaultsServerMiddleware from "./server-middleware";
import { DatabaseConnectedJwtKeyManager } from "@/JwtKeyManager";
import MockJwtKeySetsStore from "@/JwtKeyManager/JsonWebKeySetsStore/MockJwtKeySetsStore";

class MockJwtKeyManager extends DatabaseConnectedJwtKeyManager {
  public constructor() {
    super(new MockJwtKeySetsStore());
  }

  public isConfigured(): boolean {
    return true;
  }
}

describe("SchemaVaultsServerMiddleware Initialization", () => {
  test("can initialize the SchemaVaults server middleware for auth server", () => {
    let errorThrown: boolean = false;
    try {
      const middleware = new SchemaVaultsServerMiddleware({
        debug: true,
        api_server_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
        jwt_keys_manager: new MockJwtKeyManager(),
      });
      console.log(
        "SchemaVaultsServerMiddleware Flow String: ",
        middleware.toMiddlewareFlowString(),
      );
    } catch (e: unknown) {
      console.error("Error initializing middleware: ", e);
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });

  test("can initialize the SchemaVaults server middleware for the SchemaVaults mail app", () => {
    let errorThrown: boolean = false;
    try {
      const middleware = new SchemaVaultsServerMiddleware({
        debug: true,
        api_server_id: SCHEMAVAULTS_MAIL_APP_DEFINITION.app_id,
      });
      console.log(
        "SchemaVaultsServerMiddleware Flow String: ",
        middleware.toMiddlewareFlowString(),
      );
    } catch (e: unknown) {
      console.error(
        "Error initializing SchemaVaults server middleware for the schemavaults mail server: ",
        e,
      );
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });

  test("can initialize the SchemaVaults server middleware for random API server", () => {
    const api_server_id: string = crypto.randomUUID();

    let errorThrown: boolean = false;
    try {
      const middleware = new SchemaVaultsServerMiddleware({
        debug: true,
        api_server_id,
      });
      console.log(
        "SchemaVaultsServerMiddleware Flow String: ",
        middleware.toMiddlewareFlowString(),
      );
    } catch (e: unknown) {
      console.error("Error initializing middleware: ", e);
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });

  test("has an 'isConfigured()' method that returns a boolean", () => {
    const instance = new MockJwtKeyManager();
    expect(instance.isConfigured).toBeFunction();
    expect(instance.isConfigured()).toBeBoolean();
  });
});
