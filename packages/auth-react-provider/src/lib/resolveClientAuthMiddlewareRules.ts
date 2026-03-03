import type { AuthMiddlewareRulesBuilderFn } from "@/types/AuthMiddlewareRulesBuilderFn";
import {
  type AuthMiddlewareRules,
  defaultAuthMiddlewareRules,
} from "@schemavaults/auth-common";

export default function resolveClientAuthMiddlewareRules(
  authMiddlewareRulesProp:
    | AuthMiddlewareRules
    | AuthMiddlewareRulesBuilderFn
    | undefined,
): AuthMiddlewareRules | undefined {
  if (typeof authMiddlewareRulesProp === "undefined") {
    return undefined;
  }

  if (typeof authMiddlewareRulesProp === "function") {
    return authMiddlewareRulesProp(defaultAuthMiddlewareRules);
  } else if (
    typeof authMiddlewareRulesProp === "object" &&
    authMiddlewareRulesProp
  ) {
    return authMiddlewareRulesProp;
  }

  throw new TypeError("Invalid 'authMiddlewareRules' prop!");
}
