import type { AuthenticationOutcomeType } from "@/lib/authentication-outcome-type";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { Credentials } from "./credentials";
import type { CodeChallengeWithDetails } from "@schemavaults/auth-common";
import type { AppId, SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export interface ISendAuthenticateRequestOptions {
  adapter: ISchemaVaultsAuthClientAdapter;
  authentication_type: AuthenticationOutcomeType;
  client_app_id: AppId;
  credentials: Credentials;
  code_challenge: CodeChallengeWithDetails;
  app_environment: SchemaVaultsAppEnvironment;
  invite_code_required: boolean;
}

export type { ISendAuthenticateRequestOptions as SendAuthenticateRequestOptions };
