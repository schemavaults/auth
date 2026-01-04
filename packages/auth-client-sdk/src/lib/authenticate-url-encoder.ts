import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type {
  CodeChallenge,
  CodeChallengeWithDetails,
} from "@schemavaults/auth-common";

export interface AuthenticateOptions {
  // The type of authentication to perform
  type: "login" | "register";

  // https://datatracker.ietf.org/doc/html/rfc7636#section-4.2
  // Hash of the code verifier
  // Allows proving that the client initiating the flow is the same as the client that the authorization server issued the code to
  code_challenge: CodeChallengeWithDetails;

  // The URL to redirect the user to after authentication
  // E.g. https://schemavaults.com/auth/authenticate
  // Sends the user back to the client with the authorization code
  // The client can then exchange the authorization code for an access token (with the pre-hashed nonce), finishing the PKCE flow
  redirect_uri: string;

  // App Client ID
  // The ID of the app that the user is trying to authenticate with
  // Used to look up the app in the app registry
  app_id: string;

  // URL of the SchemaVaults auth server instance to authenticate against
  auth_server_uri: string;

  app_env: SchemaVaultsAppEnvironment;
}

export interface ValidateAuthenticateURLOptions {
  redirect_uri: string;
  app_env: SchemaVaultsAppEnvironment;
}

export class AuthenticateURLEncoder {
  // Throws an error if anything seems off about the redirect URI
  private static validate_redirect_uri({
    redirect_uri,
    app_env,
  }: ValidateAuthenticateURLOptions): void {
    const requiresSSL: boolean =
      app_env !== "development" && app_env !== "test";
    if (requiresSSL && !redirect_uri.startsWith("https://")) {
      throw new Error("Redirect URI must use HTTPS in production");
    }
  }

  public static encode(opts: AuthenticateOptions) {
    const environment = opts.app_env;
    const auth_server = opts.auth_server_uri;

    const server_page = `/auth/${opts.type}` as const;

    // Prepare query parameters
    // https://datatracker.ietf.org/doc/html/rfc7636#section-4.3
    const queryParams = new URLSearchParams();

    // Tell the auth server what app the user is trying to authenticate with
    queryParams.set("app_id", opts.app_id);

    // Set up the code challenge through the query parameters
    queryParams.set(
      "code_challenge",
      opts.code_challenge.code_challenge satisfies CodeChallenge,
    );
    queryParams.set(
      "code_challenge_method",
      opts.code_challenge.code_challenge_method,
    );
    queryParams.set(
      "challenge_time",
      opts.code_challenge.challenge_time.toString(),
    );

    const redirect_uri: string = opts.redirect_uri;
    const app_env = opts.app_env;

    // Set up where the auth server should redirect the user after successful authentication
    try {
      AuthenticateURLEncoder.validate_redirect_uri({ redirect_uri, app_env });
    } catch (e: unknown) {
      console.error(
        "Invalid return-to-this-app-redirect URI for Oauth2 PKCE flow: ",
        e,
      );
      throw new Error("Invalid redirect URI!");
    }
    queryParams.set("redirect_uri", opts.redirect_uri);

    const authenticate_url =
      `${auth_server}${server_page}?${queryParams.toString()}` as const;

    if (environment !== "production") {
      console.log(
        "[AuthenticateURLEncoder] Encoded authenticate URL: ",
        authenticate_url,
      );
    }

    return authenticate_url;
  }
}

export default AuthenticateURLEncoder;
