import "server-only";
import {
  apiServerIdSchema,
  doesApiServerAcceptDelegatedTokens,
  type ApiServerId,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import DelegatedTokensNotAcceptedError from "@/lib/error/DelegatedTokensNotAcceptedError";

export interface AssertDelegatedTokenIssuanceOptions {
  /** The API server (keyset owner) the delegated access token is minted for. */
  api_server_id: string;
  /** Whether a refresh token would be minted alongside the access token. */
  issue_refresh_token: boolean;
  /** Whether an id_token would be minted alongside the access token. */
  include_id_token: boolean;
  /** Loads an API server's definition (hardcoded or registered); null if unknown. */
  loadApiServer: (
    api_server_id: ApiServerId,
  ) => Promise<SchemaVaultsApiServerDefinition | null>;
}

/**
 * The rules for minting a DELEGATED access token, one whose RFC 8693 `act`
 * claim names someone acting on behalf of the user (e.g. a client app's
 * agent). Checked by issueOidcTokens() before anything is minted:
 *
 *  - The access token comes alone. A refresh token cannot carry the actor
 *    (`@schemavaults/jwt` refuses `act` on refresh tokens), so refreshing it
 *    would mint plain user tokens and launder the delegation away; and no
 *    id_token, as nobody authenticated to the actor. Breaking this rule is
 *    a programming error (TypeError).
 *  - Only for an API server that accepts delegated tokens
 *    (`doesApiServerAcceptDelegatedTokens()`): resource servers before
 *    `@schemavaults/jwt` 0.16.0 reject any token carrying `act`, so an API
 *    server's managers opt in once theirs is ready; hardcoded API servers
 *    (the auth server itself, the `oidc-userinfo` audience) never do.
 *    Otherwise DelegatedTokensNotAcceptedError, which a grant answers with
 *    `invalid_target` (RFC 8693 §2.2.2).
 */
export async function assertDelegatedTokenIssuance({
  api_server_id,
  issue_refresh_token,
  include_id_token,
  loadApiServer,
}: AssertDelegatedTokenIssuanceOptions): Promise<void> {
  if (issue_refresh_token || include_id_token) {
    throw new TypeError(
      "A delegated access token is minted alone: no refresh token (it cannot carry the actor) and no id_token",
    );
  }
  const parsed = apiServerIdSchema.safeParse(api_server_id);
  const api_server: SchemaVaultsApiServerDefinition | null = parsed.success
    ? await loadApiServer(parsed.data)
    : null;
  if (!doesApiServerAcceptDelegatedTokens(api_server)) {
    throw new DelegatedTokensNotAcceptedError(api_server_id);
  }
}

export default assertDelegatedTokenIssuance;
