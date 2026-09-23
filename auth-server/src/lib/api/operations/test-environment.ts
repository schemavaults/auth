import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { getTestEmailVerificationToken } from "@/app/api/test/email-verification-token/[email]/operation";
import { getTestPasswordResetToken } from "@/app/api/test/password-reset-token/[email]/operation";
import { resetRateLimits } from "@/app/api/test/reset-rate-limit/operation";
import { createTestNextjsApp } from "@/app/api/test/seed/create-test-nextjs-app/[api_server_id]/operation";
import { enrollTestUserMfa } from "@/app/api/test/seed/enroll-test-user-mfa/operation";
import {
  migrateTestEnvironmentDb,
  migrateTestEnvironmentDbViaGet,
} from "@/app/api/test/seed/migrate-test-environment-db/operation";

/** Operations of the "test-environment" domain, in the order they appear in the docs. */
export const test_environmentOperations: readonly AnyOperationDefinition[] = [
  migrateTestEnvironmentDb,
  migrateTestEnvironmentDbViaGet,
  createTestNextjsApp,
  enrollTestUserMfa,
  getTestEmailVerificationToken,
  getTestPasswordResetToken,
  resetRateLimits,
];
