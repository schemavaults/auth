import "server-only";
import type { AppId } from "@schemavaults/app-definitions";
import type { CustomJWTPayload } from "@schemavaults/jwt";
import type { BasicClientCredentials } from "@/lib/oauth2/authenticate-token-endpoint-client";

/** A request refused before the token is looked at (RFC 6749 §5.2). */
export interface RevocationRequestError {
  error: "invalid_request" | "invalid_client";
  error_description: string;
}

/** A revocation request as read from the wire, nothing verified yet. */
export interface ParsedRevocationRequest {
  /** The `token` parameter: the token to revoke. */
  token: string;
  /** The client the token must have been issued to. */
  client_app_id: AppId;
  /** `client_secret_basic` credentials, if the request carried a Basic header. */
  basic_credentials: BasicClientCredentials | null;
  /** `client_secret_post` secret, if any. */
  post_client_secret: string | null;
}

export type ParseRevocationRequestResult =
  | { ok: true; request: ParsedRevocationRequest }
  | { ok: false; error: RevocationRequestError };

/** A token that verified and was issued to the requesting client. */
export interface VerifiedRevocableToken {
  kind: "access" | "refresh";
  payload: CustomJWTPayload;
}

/** What the presented token turned out to be, for the requesting client. */
export type RevocableToken =
  /** Not a live token of this server: nothing to revoke (§2.2: 200). */
  | { kind: "unverifiable" }
  /** An access token minted for an API server (§2.2.1 `unsupported_token_type`). */
  | { kind: "unsupported" }
  /** A live token whose `app` claim names another client (§2.1: refused). */
  | { kind: "issued_to_another_client" }
  | VerifiedRevocableToken;
