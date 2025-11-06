import type { AccessToken, RefreshToken, UserData } from "@schemavaults/auth-common";

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

  getRefreshToken: () => RefreshToken | null;
  getAccessToken: (token_id: string) => AccessToken | null;

  clearAuthTokens: () => void;
  clearAccessToken: (token_id: string) => void;
}

export interface IAuthClientPOSTResultType<T extends object> {
  status: number;
  ok: boolean;
  data: T;
}

interface AuthClientNetworkActions {
  // Returns the result of response.json() (not the actual response itself)
  // Should throw if request returns an error response or does not return valid json!
  sendPOSTRequest: (
    url: string,
    body: Record<string, unknown>,
    headers: Record<string, string>
  ) => Promise<IAuthClientPOSTResultType<object>>
}

// To use the auth client from a framework like React.js/Next.js, you would need to create an adapter
// E.g. the next.js adapter uses cookies-next to manage cookies
export interface ISchemaVaultsAuthClientAdapter extends
  AuthClientCodeVerifierActions,
  AuthClientUserDataActions,
  AuthClientAuthTokensActions,
  AuthClientNetworkActions
{
  redirect: (uri: string) => void | Promise<void>;
  uuid: () => string;
}
