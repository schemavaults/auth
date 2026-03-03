import type { AuthMiddlewareRules } from "@schemavaults/auth-common";

export type AuthMiddlewareRulesBuilderFn = (
  defaultAuthRules: AuthMiddlewareRules,
) => AuthMiddlewareRules;
