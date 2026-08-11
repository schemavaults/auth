// openid-client-demo
//
// Barrel for the standard-OIDC sign-in demos driven by the generic
// `openid-client` npm package. See ./config.ts for the two relying
// party variants (public / confidential) and the rationale for keeping
// this whole module free of @schemavaults/auth-* SDK imports.

export {
  discoverAuthServer,
  getOpenidClientDemoConfig,
  getPublicOrigin,
  type OpenidClientDemoConfig,
  type OpenidClientDemoSession,
  type OpenidClientDemoVariant,
} from "./config";
export { handleOpenidClientDemoLogin } from "./login-handler";
export { handleOpenidClientDemoCallback } from "./callback-handler";
export { renderOpenidClientDemoProfilePage } from "./profile";
