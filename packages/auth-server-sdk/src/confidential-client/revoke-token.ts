import { getOidcEndpointUrl } from "@schemavaults/auth-common";
import {
  type ConfidentialClientCredentials,
  postAsConfidentialClient,
} from "./shared";

export interface IRevokeTokenOptions extends ConfidentialClientCredentials {
  /**
   * A token issued to this client: a delegated access token it obtained by
   * token exchange, or one of its users' refresh tokens.
   */
  token: string;
  /** RFC 7009 §2.1 hint; the auth server reads the kind from the token itself. */
  token_type_hint?: "access_token" | "refresh_token";
}

/**
 * Revokes a token issued to this confidential client (RFC 7009), e.g. the
 * delegated token of an agent whose session ended, so that introspection and
 * resource servers checking revocation refuse it before it expires.
 *
 * Resolves for any token the auth server does not know (RFC 7009 §2.2: an
 * invalid token is not an error); revoking twice is harmless.
 *
 * @throws {OAuthEndpointError} when the auth server refuses the request:
 * `invalid_client` (bad credentials), `invalid_grant` (the token was issued
 * to another client), `unsupported_token_type` (a token the client cannot
 * revoke, such as a user's own access token for an API server).
 */
export async function revokeToken({
  token,
  token_type_hint,
  ...credentials
}: IRevokeTokenOptions): Promise<void> {
  if (typeof token !== "string" || token.length === 0) {
    throw new TypeError("Expected a token to revoke!");
  }
  const form = new URLSearchParams({ token });
  if (token_type_hint !== undefined) {
    form.set("token_type_hint", token_type_hint);
  }
  await postAsConfidentialClient(
    credentials,
    "revocation",
    getOidcEndpointUrl(credentials.auth_server_url, "revocation"),
    form,
  );
}

export default revokeToken;
