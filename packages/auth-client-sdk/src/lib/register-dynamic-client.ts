import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  dynamicClientRegistrationErrorSchema,
  dynamicClientRegistrationResponseSchema,
  getOidcEndpointUrl,
  type DynamicClientRegistrationError,
  type DynamicClientRegistrationRequest,
  type DynamicClientRegistrationResponse,
} from "@schemavaults/auth-common";

/**
 * Thrown when the registration endpoint refuses the request (RFC 7591
 * §3.2.2) or is disabled on the deployment. `error` carries the RFC error
 * code (`invalid_redirect_uri`, `invalid_client_metadata`) or the auth
 * server's own code (`access_denied` when registration is disabled).
 */
export class DynamicClientRegistrationFailedError extends Error {
  public readonly status: number;
  public readonly error: string;
  public readonly error_description: string | undefined;

  public constructor(
    status: number,
    error: string,
    error_description?: string,
  ) {
    super(
      `Dynamic client registration failed (${status} ${error})${
        error_description ? `: ${error_description}` : ""
      }`,
    );
    this.name = "DynamicClientRegistrationFailedError";
    this.status = status;
    this.error = error;
    this.error_description = error_description;
  }

  public isRfc7591Error(): this is DynamicClientRegistrationFailedError & {
    error: DynamicClientRegistrationError["error"];
  } {
    return dynamicClientRegistrationErrorSchema.safeParse({
      error: this.error,
    }).success;
  }
}

export interface IRegisterDynamicClientOpts {
  adapter: Pick<ISchemaVaultsAuthClientAdapter, "fetch">;
  auth_server_uri: string;
  metadata: DynamicClientRegistrationRequest;
}

/**
 * @description Registers a new OAuth 2.0 client with the auth server
 * through RFC 7591 dynamic client registration (`POST
 * /api/oidc/register`). Anonymous: no session or credentials are sent.
 * The deployment must have enabled registration
 * (`allow_dynamic_client_registration`), which the discovery document
 * signals by advertising `registration_endpoint`.
 *
 * Returns the RFC 7591 §3.2.1 response: the new `client_id`, the one-time
 * `client_secret` for confidential clients (`token_endpoint_auth_method`
 * other than `none`), `client_id_issued_at`, and the registered metadata.
 *
 * @throws DynamicClientRegistrationFailedError on a non-2xx response.
 */
export async function registerDynamicClient({
  adapter,
  auth_server_uri,
  metadata,
}: IRegisterDynamicClientOpts): Promise<DynamicClientRegistrationResponse> {
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    !Array.isArray(metadata.redirect_uris) ||
    metadata.redirect_uris.length === 0
  ) {
    throw new TypeError(
      "Dynamic client registration requires at least one redirect URI",
    );
  }

  const response = await adapter.fetch(
    getOidcEndpointUrl(auth_server_uri, "registration"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(metadata),
      // Registration is anonymous: never attach the platform's cookies.
      credentials: "omit",
    },
  );

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const failure =
      typeof body === "object" && body !== null
        ? (body as { error?: unknown; error_description?: unknown })
        : {};
    throw new DynamicClientRegistrationFailedError(
      response.status,
      typeof failure.error === "string" ? failure.error : "registration_failed",
      typeof failure.error_description === "string"
        ? failure.error_description
        : undefined,
    );
  }

  const parsed = dynamicClientRegistrationResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      "The auth server returned a malformed dynamic client registration response",
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

export default registerDynamicClient;
