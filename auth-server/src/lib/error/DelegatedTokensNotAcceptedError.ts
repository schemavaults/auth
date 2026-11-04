/**
 * Thrown when a delegated access token (one carrying an RFC 8693 `act`
 * claim) is about to be minted for an API server that does not accept
 * delegated tokens: an unknown or hardcoded API server, or one whose
 * managers have not turned `accept_delegated_tokens` on. A grant that
 * mints delegated tokens maps it to the token endpoint's `invalid_target`
 * (RFC 8693 §2.2.2).
 */
export class DelegatedTokensNotAcceptedError extends Error {
  /** The API server (keyset owner) the token would have been minted for. */
  public readonly api_server_id: string;

  public constructor(api_server_id: string) {
    super(`The API server '${api_server_id}' does not accept delegated tokens`);
    this.name = "DelegatedTokensNotAcceptedError";
    this.api_server_id = api_server_id;
  }
}

export default DelegatedTokensNotAcceptedError;
