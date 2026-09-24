import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { adminOperations } from "./admin";
import { appsOperations } from "./apps";
import { apisOperations } from "./apis";
import { organizationsOperations } from "./organizations";
import { accountOperations } from "./account";
import { authenticationOperations } from "./authentication";
import { oidcOperations } from "./oidc";
import { mfaOperations } from "./mfa";
import { resource_serversOperations } from "./resource-servers";
import { configurationOperations } from "./configuration";
import { test_environmentOperations } from "./test-environment";

/**
 * The catalogue of every operation the auth server serves.
 *
 * Each operation is declared in an `operation.ts` next to the Next.js
 * `route.ts` that serves it (under `src/app/api/`); the route file mounts
 * its own small Hono app with `apiRouteHandlers()` from ../app.ts. This
 * list ties them back together: it drives the single OpenAPI document
 * (../openapi-document.ts, served at GET /api/openapi.json and rendered by
 * the /docs pages). Route files do not import it, so `../routes.test.ts`
 * checks that every route file's operations are listed here and that every
 * listed operation has its route file.
 *
 * Adding an operation therefore means: create `src/app/api/<path>/operation.ts`
 * and mount it from `route.ts`, then add it to its domain list in this folder.
 */
export const operations: readonly AnyOperationDefinition[] = [
  ...authenticationOperations,
  ...mfaOperations,
  ...oidcOperations,
  ...accountOperations,
  ...appsOperations,
  ...apisOperations,
  ...organizationsOperations,
  ...adminOperations,
  ...resource_serversOperations,
  ...configurationOperations,
  ...test_environmentOperations,
];
