import { z } from "zod";

/**
 * Delegated-token policy field of an API server definition: whether the API
 * server accepts DELEGATED access tokens, whose RFC 8693 §4.1 actor (`act`)
 * claim names someone acting on behalf of the token's user, such as a client
 * app's agent. The token's `sub` is still the user; `act` says who is
 * actually calling.
 *
 * Off by default. An API server's managers turn it on once its resource
 * server runs `@schemavaults/auth-server-sdk` 0.39.0+ (`@schemavaults/jwt`
 * 0.16.0+): older versions validate token payloads strictly and reject any
 * token carrying `act`. The auth server mints a delegated token only for an
 * API server that accepts them (see {@link doesApiServerAcceptDelegatedTokens}).
 *
 * Optional on the wire (older SDK consumers and the hardcoded definitions
 * omit it); absent means false.
 */
export const apiServerDelegatedTokenFieldsShape = {
  accept_delegated_tokens: z.boolean().optional(),
} as const;

/**
 * Whether delegated access tokens (carrying an RFC 8693 `act` claim) may be
 * minted for an API server: only a registered API server whose managers
 * opted in. A hardcoded API server (the auth server itself, the reserved
 * `oidc-userinfo` audience) never accepts them: nobody may act on a user's
 * behalf against the user's own account. An unknown API server (null) does
 * not either.
 */
export function doesApiServerAcceptDelegatedTokens(
  api_server:
    | {
        hardcoded: boolean;
        accept_delegated_tokens?: boolean | undefined;
      }
    | null
    | undefined,
): boolean {
  return (
    api_server !== null &&
    api_server !== undefined &&
    api_server.hardcoded === false &&
    api_server.accept_delegated_tokens === true
  );
}
