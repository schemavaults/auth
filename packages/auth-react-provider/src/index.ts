export {
  SchemaVaultsAuthProvider,
  default as AuthProvider,
  default as default,
} from "./auth-provider";
export type {
  SchemaVaultsAuthProviderProps,
  AuthMiddlewareRules,
} from "./auth-provider";

export type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
export type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";

export * from "./hooks";
export type * from "./hooks";

export type * from "@/types/hook-status";

export type { UserData } from "@/types/UserData";

export type * from "@/types/client-application";

// Auth-Common Error Catalog
export {
  isValidErrorId,
  ERROR_MESSAGE_CATALOG,
} from "@schemavaults/auth-client-sdk";
