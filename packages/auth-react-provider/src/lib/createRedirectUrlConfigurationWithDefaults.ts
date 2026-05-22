import type {
  IAuthProviderRedirectUrlConfiguration,
  IAuthProviderRedirectUrlConfigurationWithDefaultsSet,
} from "@/types/IAuthProviderRedirectUrlConfiguration";

const DEFAULT_LOGIN_URI = "/auth/login" as const;
const DEFAULT_REGISTER_URI = "/auth/register" as const;
const DEFAULT_LOGOUT_URI = "/auth/logout" as const;
const DEFAULT_AUTHORIZE_URI = "/auth/authorize" as const;
const DEFAULT_ERROR_PAGE_URI = "/auth/error" as const;
const DEFAULT_SUCCESSFUL_LOGOUT_REDIRECT_URI = "/" as const;

export default function createRedirectUrlConfigurationWithDefaultsSet(
  input: IAuthProviderRedirectUrlConfiguration,
): IAuthProviderRedirectUrlConfigurationWithDefaultsSet {
  const login_uri: string =
    typeof input.login_uri === "string" ? input.login_uri : DEFAULT_LOGIN_URI;
  const register_uri: string =
    typeof input.register_uri === "string"
      ? input.register_uri
      : DEFAULT_REGISTER_URI;
  const logout_uri: string =
    typeof input.logout_uri === "string"
      ? input.logout_uri
      : DEFAULT_LOGOUT_URI;

  if (typeof input.authed_on_unauthed_redirect_uri !== "string") {
    throw new TypeError(
      "Missing 'authed_on_unauthed_redirect_uri' input prop!",
    );
  }
  const authed_on_unauthed_redirect_uri: string =
    input.authed_on_unauthed_redirect_uri;

  if (typeof input.unauthed_on_authed_redirect_uri !== "string") {
    throw new TypeError(
      "Missing 'unauthed_on_authed_redirect_uri' input prop!",
    );
  }
  const unauthed_on_authed_redirect_uri: string =
    input.unauthed_on_authed_redirect_uri;

  if (typeof input.successful_authentication_redirect_uri !== "string") {
    throw new TypeError(
      "Missing 'successful_authentication_redirect_uri' input prop!",
    );
  }
  const successful_authentication_redirect_uri =
    input.successful_authentication_redirect_uri;

  const successful_logout_redirect_uri: string =
    typeof input.successful_logout_redirect_uri === "string"
      ? input.successful_logout_redirect_uri
      : DEFAULT_SUCCESSFUL_LOGOUT_REDIRECT_URI;

  const authorize_uri: string =
    typeof input.authorize_uri === "string"
      ? input.authorize_uri
      : DEFAULT_AUTHORIZE_URI;

  const error_page_uri: string =
    typeof input.error_page_uri === "string"
      ? input.error_page_uri
      : DEFAULT_ERROR_PAGE_URI;

  return {
    login_uri,
    register_uri,
    logout_uri,
    authed_on_unauthed_redirect_uri,
    unauthed_on_authed_redirect_uri,
    successful_authentication_redirect_uri,
    successful_logout_redirect_uri,
    authorize_uri,
    error_page_uri,
  };
}
