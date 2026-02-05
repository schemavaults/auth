import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  type SchemaVaultsAppEnvironment,
  type AppId,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
} from "@schemavaults/app-definitions";
import {
  type CodeChallengeWithDetails,
  type CodeVerifierWithDetails,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";
import AuthenticateURLEncoder from "./authenticate-url-encoder";

export interface IAuthenticateWithRedirectOpts {
  type: "login" | "register";
  debug: boolean;
  client_app_id: AppId;
  auth_server_uri: string;
  adapter: ISchemaVaultsAuthClientAdapter;
  environment: SchemaVaultsAppEnvironment;
  authorize_uri: string;
  storeCodeVerifier: (code_verifier: string, challenge_time: number) => void;
}

export default async function authenticateWithRedirect({
  type,
  debug,
  client_app_id,
  auth_server_uri,
  adapter,
  environment,
  authorize_uri,
  storeCodeVerifier,
}: IAuthenticateWithRedirectOpts): Promise<void> {
  if (debug) {
    console.log(
      `[SchemaVaultsAuthClient] Authenticating with redirect (type "${type}")...`,
    );
  }

  if (client_app_id === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
    throw new Error(
      "Authenticating via redirect is for external apps, not the auth server!",
    );
  }

  // This should be kept securely within the SDK
  let code_verifier: CodeVerifierWithDetails;
  try {
    code_verifier = PKCE_ProofKeyManager.createCodeVerifier();
  } catch (e: unknown) {
    console.error(
      "Failed to create code verifier to initialize PKCE challenge process: ",
      e,
    );
    throw new Error(
      "Failed to create code verifier to initialize PKCE challenge process",
    );
  }

  // Do some validation
  if (typeof code_verifier !== "object" || !code_verifier) {
    throw new TypeError("Expected generated 'code_verifier' to be an object!");
  } else if (typeof code_verifier.challenge_time !== "number") {
    throw new TypeError(
      "Expected generated 'code_verifier.challenge_time' to be a number!",
    );
  } else if (typeof code_verifier.code_verifier !== "string") {
    throw new TypeError(
      "Expected generated 'code_verifier.code_verifier' to be a string!",
    );
  }

  // This is sent to the auth server-- it's a hash of the code verifier
  // https://datatracker.ietf.org/doc/html/rfc7636#section-4.2
  let code_challenge: CodeChallengeWithDetails;
  try {
    code_challenge =
      await PKCE_ProofKeyManager.createCodeChallenge(code_verifier);
  } catch (e: unknown) {
    console.error(
      "Auth client failed to create code challenge from code verifier object: ",
      e,
    );
    const errMsg: string =
      e instanceof Error && typeof e.message === "string"
        ? e.message
        : "Auth client encountered an unknown error while creating code challenge";
    throw new Error(
      `Auth client failed to create code challenge from code verifier object (error: ${errMsg})`,
    );
  }

  // Validate code challenge a bit
  if (typeof code_challenge.challenge_time !== "number") {
    throw new Error(
      "Expected challenge_time to be set (from input code_verifier)",
    );
  } else if (
    typeof code_challenge.code_challenge_method !== "string" ||
    code_challenge.code_challenge_method !== "S256"
  ) {
    throw new Error("Expected code_challenge_method to be set to S256");
  } else if (typeof code_challenge.code_challenge !== "string") {
    throw new Error("Expected code_challenge to be set");
  }

  // Store the code verifier in a secure location
  try {
    storeCodeVerifier(
      code_verifier.code_verifier,
      code_challenge.challenge_time,
    ) satisfies void;
  } catch (e: unknown) {
    console.error("Failed to store code verifier: ", e);
    throw new Error("Failed to store code verifier!");
  }
  // If the authentication is successful, the auth server will redirect the user back to the client
  // and the code_verifier will be used to prove that the client initiating the flow is the same as the client that the authorization server issued the code to

  if (!client_app_id) {
    console.error("App ID not set, but required for PKCE flow");
    throw new Error("App ID not set, but required for PKCE flow");
  }

  // The user is about to be redirected to auth server. Where should they be redirected back to this app? (for PKCE flow)
  const redirect_uri = authorize_uri;
  if (typeof redirect_uri !== "string") {
    throw new Error(
      "A URL to redirect to when authentication is successful was not provided. Required for PKCE flow.",
    );
  }

  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient] Attempting to build URL to open from client in order to start OAuth 2.0 PKCE flow with SchemaVaults Auth Server...",
    );
  }

  // Redirect the user to the auth server
  let authenticate_url: string;
  try {
    authenticate_url = AuthenticateURLEncoder.encode({
      type,
      code_challenge: code_challenge,
      redirect_uri,
      app_id: client_app_id,
      auth_server_uri,
      app_env: environment,
    });
  } catch (e: unknown) {
    console.error("Failed to build authenticate URL: ", e);
    throw new Error(
      "Failed to build authenticate URL (i.e. where to login/register url not found)",
    );
  }

  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient] Redirecting to authenticate URL: ",
      authenticate_url,
    );
  }

  try {
    await adapter.redirect(authenticate_url);
    return;
  } catch (e: unknown) {
    console.error(
      "Failed to redirect to authentication server using client adapter: ",
      e,
    );
    throw new Error("Failed to redirect to authentication server");
  }
}
