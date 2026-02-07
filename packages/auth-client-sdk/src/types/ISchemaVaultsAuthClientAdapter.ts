import type {
  AccessToken,
  RefreshToken,
  UserData,
} from "@schemavaults/auth-common";

interface AuthClientCodeVerifierActions {
  storeCodeVerifier: (codeVerifier: string, challenge_time: number) => void;
  loadCodeVerifier: (challenge_time: number) => string | null;
  loadCodeVerifiers: () => Record<number, string>;
  clearCodeVerifiers: () => void;
  clearCodeVerifier: (challenge_time: number) => void;
}

interface AuthClientUserDataActions {
  storeUserData: (userData: UserData) => void;
  getUserData: () => UserData | null;
  clearUserData: () => void;
}

interface AuthClientAuthTokensActions {
  storeRefreshToken: (refresh_token: RefreshToken) => void;
  storeAccessToken: (token_id: string, access_token: AccessToken) => void;

  doesSupportHttpOnlyRefreshToken?: undefined | (() => boolean);
  clearHttpOnlyRefreshToken?: () => Promise<void>;

  /**
   * @name hasHttpOnlyRefreshToken
   * @returns True if an HTTP-only refresh token cookie has been marked as received
   */
  hasHttpOnlyRefreshToken?: undefined | (() => boolean);

  /**
   * @name hasRefreshToken
   * @returns True if there is either:
   *    1.) a RefreshToken stored locally, or
   *    2.) an HTTP-only refresh token cookie has been marked as received
   */
  hasRefreshToken: () => boolean;
  /**
   * @name getRefreshToken
   * @description Loads a RefreshToken stored locally.
   *    However, it's possible that we have an 'HTTP-only refresh token cookie' received-- in this case, null is returned here.
   * @returns a RefreshToken stored locally, or null if one is not found (that is accessible to JS).
   * @see hasRefreshToken, doesSupportHttpOnlyRefreshToken
   */
  getRefreshToken: () => RefreshToken | null;
  /**
   * @name getAccessToken
   * @argument token_id - The ID of the token to retrieve (usually the desired server audience)
   * @description Loads an AccessToken stored locally.
   * @returns an AccessToken stored locally, or null if one is not found
   */
  getAccessToken: (token_id: string) => AccessToken | null;

  clearAuthTokens: () => Promise<void>;
  clearAccessToken: (token_id: string) => void;
  clearAccessTokens: () => void;
}

interface AuthClientNetworkActions {
  fetch: (url: string, init: RequestInit | undefined) => Promise<Response>;

  // Convert a relative URL (e.g. '/auth/authorize') to an absolute URL (e.g. 'http://localhost:3210/auth/authorize')
  relativeUrlToAbsoluteUrl: (relative_url: string) => string;
}

// To use the auth client from a framework like React.js/Next.js, you would need to create an adapter
// E.g. the next.js adapter uses cookies-next to manage cookies
export interface ISchemaVaultsAuthClientAdapter
  extends AuthClientCodeVerifierActions,
    AuthClientUserDataActions,
    AuthClientAuthTokensActions,
    AuthClientNetworkActions {
  redirect: (uri: string) => void | Promise<void>;
  uuid: () => string;
}
