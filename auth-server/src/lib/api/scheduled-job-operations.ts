import {
  requireAuth,
  type OperationHandlerResult,
  type ResponseDefinition,
} from "@schemavaults/openapi-operations";
import { defineOperation, type AuthServerApiContext } from "./context";
import { cronSecretScheme, sessionSchemes } from "./auth-schemes";
import { adminErrorResponses, ErrorResponse } from "./schemas";
import { API_TAGS } from "./tags";

/** What a scheduled job's run gets: the request context, and who ran it. */
export interface ScheduledJobRun {
  readonly context: AuthServerApiContext;
  /** The platform administrator who ran it by hand (POST); absent for the scheduled run (GET). */
  readonly uid?: string;
}

export interface ScheduledJobOperationsInput {
  path: string;
  /** What the job does, e.g. "Send the daily admin report". */
  summary: string;
  description: string;
  /** The 200 answer of a run. */
  result: ResponseDefinition;
  /** The 500 answer of a failed run (default: the `ErrorResponse` envelope). */
  failure?: ResponseDefinition;
  run: (job: ScheduledJobRun) => OperationHandlerResult;
}

/**
 * The two operations of a scheduled job's route, which never share a
 * credential:
 * - `GET` is the scheduler's entry point (a Vercel cron in `vercel.json`, or
 *   the `deploy/` stack's host crontab) and only accepts the deployment's
 *   cron secret (`cronSecretScheme`). Administrator sessions and access
 *   tokens are refused, and so is everything while `CRON_SECRET` is unset.
 * - `POST` lets a platform administrator run the job by hand and only
 *   accepts their session; the cron secret is refused.
 */
export function defineScheduledJobOperations({
  path,
  summary,
  description,
  result,
  failure = { description: "The job failed", schema: ErrorResponse },
  run,
}: ScheduledJobOperationsInput) {
  const viaGet = defineOperation({
    method: "get",
    path,
    summary: `${summary} (scheduled job)`,
    description: `${description} This is the scheduled job's entry point (a daily Vercel cron, or a host crontab entry for the \`deploy/\` stack): it only accepts the deployment's cron secret, never a session. Administrators run it by hand with \`POST\`.`,
    tags: [API_TAGS.admin],
    auth: requireAuth({
      schemes: [cronSecretScheme],
      notes:
        "Only the deployment's cron secret (`Authorization: Bearer <CRON_SECRET>`) is accepted; administrator sessions and access tokens are refused (use POST). Always refused while `CRON_SECRET` is unset.",
    }),
    responses: {
      200: result,
      401: {
        description: "No cron secret, or not the deployment's (`error: invalid_cron_secret`), or `CRON_SECRET` is unset",
        schema: ErrorResponse,
      },
      500: failure,
    },
    handler: (ctx): OperationHandlerResult => run({ context: ctx.context }),
  });

  const viaPost = defineOperation({
    method: "post",
    path,
    summary: `${summary} (administrators)`,
    description: `${description} Lets a platform administrator run the job by hand; the scheduled job calls \`GET\` with the cron secret instead.`,
    tags: [API_TAGS.admin],
    auth: requireAuth({
      schemes: sessionSchemes,
      routeGuard: "admin",
      notes: "Only platform administrators may run the job by hand; the cron secret is not accepted here (it is GET's credential).",
    }),
    responses: {
      200: result,
      ...adminErrorResponses,
      500: failure,
    },
    handler: (ctx): OperationHandlerResult => run({ context: ctx.context, uid: ctx.auth.user.uid }),
  });

  return { viaGet, viaPost } as const;
}
