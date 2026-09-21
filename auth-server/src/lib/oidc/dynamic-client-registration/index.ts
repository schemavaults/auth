import "server-only";

export {
  isDynamicClientRegistrationEnabled,
  loadDynamicClientRegistrationSettings,
} from "./settings";
export type { DynamicClientRegistrationSettings } from "./settings";

export {
  DYNAMIC_CLIENT_ID_PREFIX,
  generateDynamicClientId,
  isDynamicClientId,
  registerDynamicClient,
  buildDynamicClientRegistrationResponse,
} from "./register-dynamic-client";
export type {
  RegisterDynamicClientOptions,
  RegisteredDynamicClient,
} from "./register-dynamic-client";
