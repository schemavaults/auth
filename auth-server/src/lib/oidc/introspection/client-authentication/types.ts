import "server-only";
import type { AppId } from "@schemavaults/app-definitions";
import type { BasicClientCredentials } from "@/lib/oauth2/authenticate-token-endpoint-client";
import type { OidcIntrospectionCaller } from "../types";

/**
 * An RFC 6749 §5.2 error the endpoint answers before introspecting:
 * `invalid_request` (400) for a malformed request, `invalid_client` (401,
 * with a `WWW-Authenticate` challenge) for failed client authentication.
 */
export interface IntrospectionRequestError {
  error: "invalid_request" | "invalid_client";
  error_description: string;
}

/** The credentials a well-formed request presents, by authentication method. */
export type IntrospectionClientCredentials =
  | {
      /** `client_secret_basic` / `client_secret_post`: a client app. */
      method: "client_secret";
      client_app_id: AppId;
      basic_credentials: BasicClientCredentials | null;
      post_client_secret: string | null;
    }
  | {
      /** `private_key_jwt` (RFC 7523 §2.2): an API server. */
      method: "private_key_jwt";
      client_assertion: string;
      /** Optional; must name the assertion's issuer when sent. */
      client_id: string | null;
    };

export interface ParsedIntrospectionRequest {
  /** The token to introspect. */
  token: string;
  credentials: IntrospectionClientCredentials;
}

export type ParseIntrospectionRequestResult =
  | { ok: true; request: ParsedIntrospectionRequest }
  | { ok: false; error: IntrospectionRequestError };

export type AuthenticateIntrospectionCallerResult =
  | { ok: true; caller: OidcIntrospectionCaller }
  | { ok: false; error: IntrospectionRequestError };

export function invalidIntrospectionRequest(
  error_description: string,
): { ok: false; error: IntrospectionRequestError } {
  return { ok: false, error: { error: "invalid_request", error_description } };
}

export function invalidIntrospectionClient(
  error_description: string,
): { ok: false; error: IntrospectionRequestError } {
  return { ok: false, error: { error: "invalid_client", error_description } };
}
