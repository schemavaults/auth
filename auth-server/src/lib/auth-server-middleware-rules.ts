import {
  defaultAuthMiddlewareRules,
  type AuthMiddlewareRules,
} from "@schemavaults/auth";

/**
 * @name loadAuthServerMiddlewareRules
 * @returns Customized middleware rules
 */
export function loadAuthServerMiddlewareRules(): AuthMiddlewareRules {
  const rules = {
    ...defaultAuthMiddlewareRules,
    unauthed: [["auth", "forgot-password"]],
    public: [
      ...defaultAuthMiddlewareRules.public,
      ["auth", "login"],
      ["auth", "register"],
      ["auth", "logout"],
      ["api", "auth", "login"],
      ["api", "auth", "register"],
      ["close_window"],
    ],
  };
  return rules;
}

export default loadAuthServerMiddlewareRules;
