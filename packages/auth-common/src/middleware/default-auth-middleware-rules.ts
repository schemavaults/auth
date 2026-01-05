import type { AuthMiddlewareRules } from "./middleware-rules";

export const defaultAuthMiddlewareRules = {
  public: [
    [], // The root path is public
    ["auth", "logout"],
    ["auth", "authorize"],
    ["api", "token"],
    ["api", "logout"],
    ["api", "environment"], // allow frontend client to ask server what environment this is running in
    ["error"],
  ],
  unauthed: [
    ["auth", "login"],
    ["auth", "register"],
    ["auth", "forgot-password"],
  ],
  authed: [
    // -- by default, all routes require authentication
    ["account"],
    ["auth", "account"],
  ],
  admin: [["admin"]],
  api: [["api"], ["trpc"]],
} as const satisfies AuthMiddlewareRules;
