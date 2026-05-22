export interface IAuthProviderRedirectUrlConfiguration {
  /**
   * Where to send the user when they need to login
   * @default "/auth/login"
   */
  login_uri?: string;

  /**
   * Where to send the user when they wish to create a new account
   * @default "/auth/register"
   */
  register_uri?: string;

  /**
   * Where to send the user when they wish to log out
   * @default "/auth/logout"
   */
  logout_uri?: string;

  /**
   * Where to send the user when they are authenticated on a route for unauthenticated users
   * @example "/account"
   */
  authed_on_unauthed_redirect_uri: string;

  /**
   * Where to send the user when they are unauthenticated on a route requiring authentication
   * @default "/auth/login"
   */
  unauthed_on_authed_redirect_uri: string;

  /**
   * Where to send the user after a successful authentication / token-trade
   * @example "/account"
   */
  successful_authentication_redirect_uri: string;

  /**
   * Where to send the user after a successful logout
   * @default "/"
   */
  successful_logout_redirect_uri?: string;

  /**
   * Optional override for the authorize page path (where authorization code is traded for token(s))
   * @default "/auth/authorize"
   */
  authorize_uri?: string;

  /**
   * Optional override for the error page path.
   * @default "/auth/error"
   */
  error_page_uri?: string;
}

export type IAuthProviderRedirectUrlConfigurationWithDefaultsSet =
  Required<IAuthProviderRedirectUrlConfiguration>;
