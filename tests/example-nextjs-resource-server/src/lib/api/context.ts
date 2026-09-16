import "server-only";
import type {
  ApiServerId,
  SchemaVaultsAppEnvironment,
  UserData,
} from "@schemavaults/auth-server-sdk";
import { createOperationDefiner } from "@schemavaults/openapi-operations";

/**
 * Per-request context handed to every operation handler as `ctx.context`.
 * Built by `createOperationsApp({ context })` in ./app.ts. A real resource
 * server would put its database handle / service clients here.
 */
export interface ExampleApiContext {
  readonly environment: SchemaVaultsAppEnvironment;
  readonly api_server_id: ApiServerId;
}

/**
 * `defineOperation` bound to this server's context and the `UserData`
 * resolved from SchemaVaults access tokens, so handlers get typed
 * `ctx.context` and `ctx.auth.user`.
 */
export const defineOperation = createOperationDefiner<ExampleApiContext, UserData>();
