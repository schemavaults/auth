import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import {
  TEST_ENVIRONMENT_ONLY_NOTE,
  TEST_ENVIRONMENT_UNAVAILABLE_BODY,
  TestEnvironmentErrorResponse,
  testEnvironmentUnavailableResponse,
} from "@/lib/api/domain-schemas/test-environment";
import { API_TAGS } from "@/lib/api/tags";
import type { RedisCache } from "@/lib/redis";

/** Deletes every Redis rate-limit key (keys matching `rl:*`). */
async function deleteAllRateLimitKeys(redis: RedisCache): Promise<number> {
  let cursor = "0";
  let totalDeleted = 0;
  do {
    const [nextCursor, keys] = await redis.client.scan(cursor, "MATCH", "rl:*", "COUNT", 500);
    cursor = nextCursor;
    if (keys.length > 0) {
      const deleted = await redis.client.del(...keys);
      totalDeleted += deleted;
    }
  } while (cursor !== "0");
  return totalDeleted;
}

/**
 * Test-only endpoint that deletes all Redis rate-limit keys. This exists so
 * that e2e tests do not hit 429 rate-limit responses while repeatedly
 * calling login/register endpoints during a suite run.
 */
export const resetRateLimits = defineOperation({
  method: "post",
  path: "/api/test/reset-rate-limit",
  summary: "Reset all rate limits",
  description:
    "Deletes every rate-limit counter in Redis (keys matching `rl:*`) so the E2E suite can call the login / registration endpoints repeatedly without hitting 429s.",
  tags: [API_TAGS.testEnvironment],
  auth: publicAccess(TEST_ENVIRONMENT_ONLY_NOTE),
  responses: {
    200: {
      description: "The counters were deleted",
      schema: z
        .object({
          success: z.literal(true),
          error: z.literal(false),
          message: z.string(),
          deleted: z.number().int().openapi({ description: "Number of rate-limit keys deleted" }),
        })
        .openapi("ResetRateLimitsResponse"),
    },
    ...testEnvironmentUnavailableResponse,
    500: { description: "Redis could not be cleared", schema: TestEnvironmentErrorResponse },
  },
  handler: async (ctx) => {
    if (ctx.context.environment !== "test") {
      return ctx.json(404, TEST_ENVIRONMENT_UNAVAILABLE_BODY);
    }

    try {
      const deleted = await deleteAllRateLimitKeys(ctx.context.redis);
      return ctx.json(200, {
        success: true,
        error: false,
        message: `Deleted ${deleted} rate-limit key(s)`,
        deleted,
      });
    } catch (e: unknown) {
      console.error("[/api/test/reset-rate-limit] Failed to reset rate limits:", e);
      return ctx.json(500, { success: false, error: true, message: "Failed to reset rate limits" });
    }
  },
});
