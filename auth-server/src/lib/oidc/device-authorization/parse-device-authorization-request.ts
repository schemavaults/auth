import "server-only";
import {
  appIdSchema,
  getAppEnvironment,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { oidcScopeSchema } from "@schemavaults/auth-common";
import {
  parseBasicClientCredentials,
  type BasicClientCredentials,
} from "@/lib/oauth2/authenticate-token-endpoint-client";
import type { OidcTokenErrorCode } from "@/lib/oidc/oidc-errors";
import { parseOidcTokenResourceParam } from "@/lib/oidc/token-request-extensions";

export interface DeviceAuthorizationRequest {
  client_app_id: AppId;
  basic_credentials: BasicClientCredentials | null;
  post_client_secret: string | null;
  /** The requested scope (wire format validated); null when none. */
  scope: string | null;
  /** The RFC 8707 `resource`; null when none. */
  resource: string | null;
}

export interface DeviceAuthorizationRequestError {
  error: Extract<
    OidcTokenErrorCode,
    "invalid_request" | "invalid_client" | "invalid_scope" | "invalid_target"
  >;
  error_description: string;
}

export type ParseDeviceAuthorizationRequestResult =
  | { ok: true; request: DeviceAuthorizationRequest }
  | { ok: false; error: DeviceAuthorizationRequestError };

function refuse(
  error: DeviceAuthorizationRequestError["error"],
  error_description: string,
): ParseDeviceAuthorizationRequestResult {
  return { ok: false, error: { error, error_description } };
}

/**
 * Reads a device authorization request (RFC 8628 §3.1): the form-encoded
 * `client_id` (or a confidential client's HTTP Basic credentials, which may
 * carry it by themselves), the OPTIONAL `scope`, and the RFC 8707
 * `resource` whose API scopes the scope may ask for. Nothing is verified
 * here beyond the parameters' shape.
 */
export async function parseDeviceAuthorizationRequest(
  request: Request,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): Promise<ParseDeviceAuthorizationRequestResult> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse(
      "invalid_request",
      "Request body must be application/x-www-form-urlencoded.",
    );
  }
  const param = (name: string): string | null => {
    const value = form.get(name);
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  const basic_credentials = parseBasicClientCredentials(
    request.headers.get("Authorization"),
  );
  if (basic_credentials === "malformed") {
    return refuse("invalid_request", "Malformed Basic Authorization header.");
  }

  // A client identifies itself once: the form's `client_id` and the HTTP
  // Basic credentials may both be present (RFC 6749 §2.3.1 allows it), but
  // must then name the same client. RFC 6749 §5.2: failed client
  // authentication is `invalid_client`.
  const form_client_id: string | null = param("client_id");
  if (
    form_client_id !== null &&
    basic_credentials !== null &&
    form_client_id !== basic_credentials.client_id
  ) {
    return refuse(
      "invalid_client",
      "The Authorization header credentials do not match the request's client_id.",
    );
  }

  const parsed_client_id = appIdSchema.safeParse(
    form_client_id ?? basic_credentials?.client_id ?? null,
  );
  if (!parsed_client_id.success) {
    return refuse("invalid_client", "Missing or malformed 'client_id' parameter.");
  }

  const scope: string | null = param("scope");
  if (scope !== null && !oidcScopeSchema.safeParse(scope).success) {
    return refuse("invalid_scope", "Malformed 'scope' parameter.");
  }

  const parsed_resource = parseOidcTokenResourceParam(form, environment);
  if (!parsed_resource.ok) {
    return refuse("invalid_target", parsed_resource.error.error_description);
  }

  return {
    ok: true,
    request: {
      client_app_id: parsed_client_id.data,
      basic_credentials,
      post_client_secret: param("client_secret"),
      scope,
      resource: parsed_resource.resource,
    },
  };
}

export default parseDeviceAuthorizationRequest;
