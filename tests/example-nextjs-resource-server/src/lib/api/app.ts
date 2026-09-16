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
import { resolvePublicOrigin, withServerUrl } from "./public-origin";

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
  openapi: {
    path: "/api/openapi.json",
    // Report the deployment's real origin in `servers` instead of the
    // static document's relative "/".
    document: (c) =>
      withServerUrl(openApiDocument, resolvePublicOrigin((name) => c.req.header(name), c.req.url)),
  },
});
