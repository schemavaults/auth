import type { AuthenticationOutcomeType } from "@/lib/authentication-outcome-type";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { Credentials } from "./credentials";
import type { CodeChallengeWithDetails } from "@schemavaults/auth-common";
import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export interface ISendAuthenticateRequestOptions {
  adapter: ISchemaVaultsAuthClientAdapter;
  authentication_type: AuthenticationOutcomeType;
  client_app_id: AppId;
  auth_server_url: string;
  credentials: Credentials;
  code_challenge: CodeChallengeWithDetails;
  app_environment: SchemaVaultsAppEnvironment;
  invite_code_required: boolean;
  // OAuth2 `redirect_uri` to bind the issued authorization code to.
  // Required for third-party PKCE flows so the auth server can refuse
  // to mint a code for an unregistered URI, and so the redemption-time
  // exact-string compare in `handleSuccessfulAuthentication` has a
  // value to match. Null only for the auth server's own /account flow.
  redirect_uri: string | null;
  // OIDC surface context (set only when the flow entered through the
  // auth server's GET /api/oidc/authorize bridge). Flags the minted
  // authorization code as OIDC-only and carries the RP's nonce and the
  // requested scope for the server to stamp on the code row.
  oidc?: { nonce: string | null; scope: string } | null;
}

export type { ISendAuthenticateRequestOptions as SendAuthenticateRequestOptions };
