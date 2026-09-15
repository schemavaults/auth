import "server-only";
import {
  getAppEnvironment,
  getSchemavaultsApiServerId,
  type UserData,
} from "@schemavaults/auth-server-sdk";
import { createOperationsApp, type Hono } from "@schemavaults/openapi-operations";
import type { ExampleApiContext } from "./context";
import { operations } from "./operations";
import { authResolvers } from "./auth-resolvers";
import { openApiDocument } from "./openapi-document";

/**
 * The Hono app that serves every operation. Mounted from
 * `src/app/api/[[...route]]/route.ts` so one app handles all of /api/*.
 */
export const apiApp: Hono = createOperationsApp<ExampleApiContext, UserData>({
  operations,
  authResolvers,
  context: () => ({
    environment: getAppEnvironment(),
    api_server_id: getSchemavaultsApiServerId(),
  }),
  openapi: { path: "/api/openapi.json", document: openApiDocument },
});
