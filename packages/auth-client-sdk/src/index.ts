export {
  SchemaVaultsAuthClient,
  SchemaVaultsAuthClient as default,
} from "./auth-client";

export type {
  ISchemaVaultsAuthClientAdapter,
  IAuthClientPOSTResultType,
} from "@/types/ISchemaVaultsAuthClientAdapter";

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
