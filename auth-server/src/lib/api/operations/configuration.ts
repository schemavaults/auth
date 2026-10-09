import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { getEnvironment } from "@/app/api/environment/operation";
import { getBrandingConfig } from "@/app/api/config/branding/operation";
import { getAppIdConfig } from "@/app/api/config/app-id/operation";
import { getInviteCodeRequired } from "@/app/api/config/invite_code_required/operation";

/** Operations of the "configuration" domain, in the order they appear in the docs. */
export const configurationOperations: readonly AnyOperationDefinition[] = [
  getEnvironment,
  getBrandingConfig,
  getAppIdConfig,
  getInviteCodeRequired,
];
