/**
 * The credentials of a confidential client application: its app id and a
 * client secret registered for it on the auth server. Keep the secret on the
 * server; never ship it to a browser or into an agent's sandbox.
 */
export interface ConfidentialClientCredentials {
  /** The auth server URL (the issuer). */
  auth_server_url: string;
  /** The client application's id. */
  client_id: string;
  /** A client secret registered for the application. */
  client_secret: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * An OAuth 2.0 error answered by one of the auth server's endpoints
 * (RFC 6749 §5.2, RFC 7009 §2.2.1, RFC 8693 §2.2.2): `error` is the
 * machine-readable code (e.g. `invalid_request`, `invalid_scope`,
 * `invalid_target`, `unauthorized_client`), or null when the auth server
 * answered without one (an unreachable or misconfigured server).
 */
export class OAuthEndpointError extends Error {
  readonly status: number;
  readonly error: string | null;
  readonly error_description: string | null;

  constructor(
    endpoint: string,
    status: number,
    error: string | null,
    error_description: string | null,
  ) {
    super(
      `The auth server's ${endpoint} endpoint refused the request (status: ${status}` +
        `${error ? `, error: ${error}` : ""})` +
        `${error_description ? `: ${error_description}` : ""}`,
    );
    this.name = "OAuthEndpointError";
    this.status = status;
    this.error = error;
    this.error_description = error_description;
  }
}

/**
 * The `client_secret_basic` Authorization header (RFC 6749 §2.3.1): the id
 * and secret are URL-encoded, joined by a colon and base64-encoded. The URL
 * encoding keeps the input ASCII, so `btoa` is safe for any secret.
 */
export function clientSecretBasicAuthorization({
  client_id,
  client_secret,
}: Pick<ConfidentialClientCredentials, "client_id" | "client_secret">): string {
  if (typeof client_id !== "string" || client_id.length === 0) {
    throw new TypeError("Expected a client_id!");
  }
  if (typeof client_secret !== "string" || client_secret.length === 0) {
    throw new TypeError("Expected a client_secret!");
  }
  return `Basic ${btoa(`${encodeURIComponent(client_id)}:${encodeURIComponent(client_secret)}`)}`;
}

/**
 * POSTs an `application/x-www-form-urlencoded` request authenticated as the
 * confidential client. Resolves with the response when it is a 2xx and
 * throws {@link OAuthEndpointError} otherwise.
 */
export async function postAsConfidentialClient(
  credentials: ConfidentialClientCredentials,
  endpoint_name: string,
  url: string,
  form: URLSearchParams,
): Promise<Response> {
  const fetchImpl: typeof fetch = credentials.fetch ?? fetch;
  const response: Response = await fetchImpl(url, {
    method: "POST",
    headers: new Headers({
      Authorization: clientSecretBasicAuthorization(credentials),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    }),
    body: form.toString(),
  });
  if (response.ok) {
    return response;
  }

  let error: string | null = null;
  let error_description: string | null = null;
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const record = body as Record<string, unknown>;
      if (typeof record.error === "string") error = record.error;
      if (typeof record.error_description === "string") {
        error_description = record.error_description;
      }
    }
  } catch {
    // Not a JSON error body.
  }
  throw new OAuthEndpointError(endpoint_name, response.status, error, error_description);
}
