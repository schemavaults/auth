import type {
  AccessToken,
  RefreshToken,
  UserData,
  CodeChallengeWithDetails,
} from "@schemavaults/auth-common";
import type { Credentials } from "@/types/credentials";
import type { AuthenticationOutcomeType } from "@/lib/authentication-outcome-type";
import type { AcquireAccessTokenOptions } from "@/types/acquire-access-token-options";
import type { AppId } from "@schemavaults/app-definitions";

export interface ISchemaVaultsAuthClient {
  app_id: AppId;
  auth_server_uri: string;

  // Authenticate the user
  login: () => Promise<void>;
  register: () => Promise<void>;

  successful_logout_redirect_uri: string | undefined;

  // Log the user out, clear all tokens
  logout: () => Promise<void>;

  // Generate a code_verifier, store it locally, and return a code_challenge from its SHA256 hash
  // Used in authenticate-with-redirect login /register flows
  generateCodeChallenge: () => Promise<CodeChallengeWithDetails>;

  // Send credentials to acquire an authorization code
  sendAuthenticateRequest: (
    authentication_type: AuthenticationOutcomeType,
    credentials: Credentials,
    code_challenge: CodeChallengeWithDetails,
  ) => Promise<string>;

  // Where to send the user after they are successfully logged in and have acquired access/refresh tokens
  successful_authentication_redirect_uri: string;

  // Where to send the user in order to trade an authorization code + code verifier for a refresh token
  authorize_uri: string | undefined;

  // Takes an authorization code, attempts to retrieve the code_verifier from storage using the challenge_time, and exchanges the authorization code + verifier for auth tokens
  handleSuccessfulAuthentication: (
    authorization_code: string,
    challenge_time: number,
    code_verifier?: string,
  ) => Promise<void>;

  getAccessTokenFromCache: (token_id: string) => AccessToken | null;
  getRefreshTokenFromCache: () => RefreshToken | null;
  hasHttpOnlyRefreshToken: () => boolean;

  /**
   *
   * @param opts Options for the type & how the access token should be retrieved
   * @param ensure_fresh Make sure this access token is acquired from the auth server "fresh"; don't use one from the cache (if it exists)
   * @returns AccessToken
   */
  acquireAccessToken: (opts: AcquireAccessTokenOptions) => Promise<AccessToken>;

  // Whether the client should only use HTTPS
  secure: boolean;

  // Current user data
  currentUser: UserData | null;

  /**
   * @name onAuthStateChanged
   * @param listener A callback that is called whenever an auth state change event is emitted
   * @param listener_id A unique ID for this listener, to allow it to be removed. A uuid is generated if an ID is not supplied.
   * @returns The listener_id that the callback was registered with
   */
  onAuthStateChanged: (listener: () => void, listener_id?: string) => string;

  /**
   * @name removeAuthStateChangeListener
   * @param listener_id A unique ID for the listener callback to remove
   * @returns None
   * @throws if no callback with listener_id exists, or if it was unable to be deleted
   */
  removeAuthStateChangeListener: (listener_id: string) => void;

  /**
   * @name loadSavedAuthorizationCodeVerifiers
   * @returns Code verifiers saved by auth adapter
   */
  loadSavedAuthorizationCodeVerifiers: () => Promise<Record<number, string>>;

  /**
   * @name isAuthenticated
   * @returns Getter that returns true if there is a user currently signed in, false otherwise
   */
  isAuthenticated: boolean;
}
