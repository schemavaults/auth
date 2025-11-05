import type { AuthenticationOutcomeType } from "@/lib/authentication-outcome-type";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/framework-adapter-interface";
import type { Credentials } from "./credentials";
import type { CodeChallengeWithDetails } from "@schemavaults/auth";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export interface ISendAuthenticateRequestOptions {
  adapter: ISchemaVaultsAuthClientAdapter;
  authentication_type: AuthenticationOutcomeType;
  credentials: Credentials;
  code_challenge: CodeChallengeWithDetails;
  app_environment: SchemaVaultsAppEnvironment;
}

export type { ISendAuthenticateRequestOptions as SendAuthenticateRequestOptions };
