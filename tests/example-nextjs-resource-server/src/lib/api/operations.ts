import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { health } from "@/app/api/health/operation";
import { echo } from "@/app/api/echo/operation";
import { ping } from "@/app/api/ping/operation";
import { whoami } from "@/app/api/whoami/operation";
import { myEmail } from "@/app/api/me/email/operation";
import { adminPing } from "@/app/api/admin/ping/operation";
import { organizationGreeting } from "@/app/api/organizations/[organization_id]/greeting/operation";

/**
 * The catalogue of every operation this example resource server serves.
 *
 * Each operation is declared in an `operation.ts` next to the Next.js
 * `route.ts` that serves it (under `src/app/api/`), so every route has its
 * own route handler. This list is what ties them back together: it drives
 * the single OpenAPI document (./openapi-document.ts, served at
 * GET /api/openapi.json and rendered by /docs) and the app factory in
 * ./app.ts, which refuses to mount an operation that is not listed here.
 *
 * Adding an operation therefore means: create `src/app/api/<path>/operation.ts`
 * and `route.ts`, then add the operation to this list (the test in
 * ./routes.test.ts checks that both halves exist for every path).
 */
export const operations: readonly AnyOperationDefinition[] = [
  health,
  echo,
  ping,
  whoami,
  myEmail,
  adminPing,
  organizationGreeting,
];
