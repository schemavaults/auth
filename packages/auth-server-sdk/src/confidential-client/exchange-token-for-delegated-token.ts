import {
  formatScope,
  getOidcEndpointUrl,
  OAUTH_ACCESS_TOKEN_TYPE,
  OAUTH_TOKEN_EXCHANGE_GRANT_TYPE,
  type ScopeInput,
} from "@schemavaults/auth-common";
import { z } from "zod";
import {
  type ConfidentialClientCredentials,
  postAsConfidentialClient,
} from "./shared";

export interface IExchangeTokenForDelegatedTokenOptions
  extends ConfidentialClientCredentials {
  /**
   * An access token one of this client's users holds for the API server the
   * agent will call (the RFC 8693 `subject_token`). It must be the user's
   * own token, issued to this client, and still live: not expired or
   * revoked, and the user's authorization of the app still standing.
   */
  subject_token: string;
  /**
   * The scope of the delegated token, a subset of the subject token's:
   * space-delimited, or a list of scope values and definitions
   * (`[oidcScopes.openid, notesScopes.read]`). Omit to keep the subject
   * token's whole scope. Asking for more answers `invalid_scope`.
   */
  scope?: ScopeInput;
  /**
   * RFC 8707 resource indicator. Optional: a delegated token is always
   * minted for the subject token's own audience, and any other value
   * answers `invalid_target`. To act at another API server, exchange an
   * access token for that one.
   */
  resource?: string;
}

/** The auth server's RFC 8693 §2.2.1 token exchange response. */
export const delegatedTokenResponseSchema = z.looseObject({
  /** The delegated access token: hand it to the agent. */
  access_token: z.string().min(1),
  issued_token_type: z.literal(OAUTH_ACCESS_TOKEN_TYPE),
  token_type: z.literal("Bearer"),
  /**
   * Lifetime in seconds: what the subject token had left (a delegated token
   * expires with it). To keep the agent going, renew the user's access token
   * and exchange the new one; there is no refresh token.
   */
  expires_in: z.number().int().positive(),
  /** Space-delimited granted scope; absent when the token carries none. */
  scope: z.string().optional(),
});

export type DelegatedTokenResponse = z.infer<typeof delegatedTokenResponseSchema>;

function serializeScope(scope: ScopeInput): string {
  const serialized: string = formatScope(scope);
  if (serialized.length === 0) {
    throw new TypeError(
      "Expected a non-empty 'scope'; omit it to keep the subject token's scope.",
    );
  }
  return serialized;
}

/**
 * Swaps an access token of one of this client's users for a DELEGATED
 * access token (RFC 8693 token exchange): same user (`sub`), same API
 * server, at most the same scope, with the client's service account named
 * as the actor (`act`). Hand the delegated token, not the user's, to an
 * agent acting for the user (e.g. one running in a sandbox), so the API
 * server can tell the agent from the user and the agent holds only the
 * scope it needs.
 *
 * Only confidential clients can exchange (they authenticate with
 * `client_secret_basic` here), and only for API servers whose managers
 * accept delegated tokens (otherwise `invalid_target`). The response holds
 * an access token alone, which expires when the subject token does (auth
 * server >= 0.67.8): when it expires, exchange a fresh access token of the
 * user's again. End the delegation early with `revokeToken()`.
 *
 * @throws {OAuthEndpointError} when the auth server refuses the exchange.
 * Notable codes: `invalid_request` (the subject token is invalid, expired
 * or about to, revoked, already delegated, or the user's access behind it
 * was withdrawn), `invalid_scope` (wider than the subject token's), and
 * `invalid_target` (another audience, or an API server that does not
 * accept delegated tokens).
 */
export async function exchangeTokenForDelegatedToken({
  subject_token,
  scope,
  resource,
  ...credentials
}: IExchangeTokenForDelegatedTokenOptions): Promise<DelegatedTokenResponse> {
  if (typeof subject_token !== "string" || subject_token.length === 0) {
    throw new TypeError("Expected a subject_token to exchange!");
  }
  if (resource !== undefined && (typeof resource !== "string" || resource.length === 0)) {
    throw new TypeError("Expected 'resource' to be a non-empty string when set!");
  }

  const form = new URLSearchParams({
    grant_type: OAUTH_TOKEN_EXCHANGE_GRANT_TYPE,
    subject_token,
    subject_token_type: OAUTH_ACCESS_TOKEN_TYPE,
  });
  if (scope !== undefined) {
    form.set("scope", serializeScope(scope));
  }
  if (resource !== undefined) {
    form.set("resource", resource);
  }

  const response: Response = await postAsConfidentialClient(
    credentials,
    "token",
    getOidcEndpointUrl(credentials.auth_server_url, "token"),
    form,
  );

  const parsed = delegatedTokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(
      "Received an unexpected token exchange response from the auth server",
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

export default exchangeTokenForDelegatedToken;
