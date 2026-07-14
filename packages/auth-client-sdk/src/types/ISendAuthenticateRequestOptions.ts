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
  // Login replay nonce — OPTIONAL (OIDC Core §3.1.2.1: a relying party
  // may omit it). When a non-empty string, it is bound server-side to
  // the minted authorization code and echoed back in the token-exchange
  // response (custom surface) / id_token claim (OIDC surface); when null
  // it is omitted from the request body and no nonce is bound.
  nonce: string | null;
  // Space-delimited requested scopes (RFC 6749 §3.3) — REQUIRED on
  // every flow; the server re-derives the granted subset and stamps it
  // on the code row and issued tokens.
  scope: string;
}

export type { ISendAuthenticateRequestOptions as SendAuthenticateRequestOptions };
