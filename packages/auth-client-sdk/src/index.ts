export {
  SchemaVaultsAuthClient,
  SchemaVaultsAuthClient as default,
} from "./auth-client";

export type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export type {
  InitializeAuthClientOptions,
  IAuthClientConstructorOptions,
} from "@/types/IAuthClientConstructorOptions";
export type { ISchemaVaultsAuthClient } from "@/types/ISchemaVaultsAuthClient";
export type { ISendAuthenticateRequestOptions } from "@/types/ISendAuthenticateRequestOptions";

export type { UserData } from "@/types/UserData";

export {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-common/RefreshTokenCookieNames";

// Hardcoded Apps
export {
  getHardcodedApp,
  getHardcodedClientWebAppDomain,
} from "@schemavaults/app-definitions";

// Hardcoded API Server Domains
export {
  getHardcodedApiServer,
  getHardcodedApiServerDomain,
} from "@schemavaults/app-definitions";
