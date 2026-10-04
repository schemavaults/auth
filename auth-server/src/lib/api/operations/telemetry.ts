import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { reportClientError } from "@/app/api/client-errors/[client_app_id]/operation";

/** Operations of the "telemetry" domain, in the order they appear in the docs. */
export const telemetryOperations: readonly AnyOperationDefinition[] = [reportClientError];
