import "server-only";
import { appIdSchema } from "@schemavaults/app-definitions";
import { OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE } from "@schemavaults/auth-common";
import { parseBasicClientCredentials } from "@/lib/oauth2/authenticate-token-endpoint-client";
import {
  invalidIntrospectionClient,
  invalidIntrospectionRequest,
  type ParseIntrospectionRequestResult,
} from "./types";

/**
 * Reads an introspection request (RFC 7662 §2.1): the form-encoded `token`
 * and the client's credentials, which must use exactly one method:
 *
 *  - `client_secret_basic` (HTTP Basic `Authorization`) or
 *    `client_secret_post` (`client_id` + `client_secret` fields): a client
 *    app. A Basic-only client may omit `client_id` (RFC 6749 §2.3.1).
 *  - `private_key_jwt` (`client_assertion_type` + `client_assertion`, RFC
 *    7523 §2.2): an API server.
 *
 * Checks run in a fixed order so each malformed request gets one stable
 * error. The `token_type_hint` parameter (§2.1) is accepted but ignored:
 * the token kind is read from the token itself, so the hint can never
 * change the outcome. Nothing is verified here; see
 * authenticateIntrospectionCaller().
 */
export async function parseIntrospectionRequest(
  request: Request,
): Promise<ParseIntrospectionRequestResult> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalidIntrospectionRequest(
      "Request body must be application/x-www-form-urlencoded.",
    );
  }
  const param = (name: string): string | null => {
    const value = form.get(name);
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  // `token` is the one REQUIRED parameter; omitting it is a 400, not an
  // inactive-token 200.
  const token: string | null = param("token");
  if (!token) {
    return invalidIntrospectionRequest("Missing 'token' parameter.");
  }

  const basic_credentials = parseBasicClientCredentials(
    request.headers.get("Authorization"),
  );
  if (basic_credentials === "malformed") {
    return invalidIntrospectionRequest("Malformed Basic Authorization header.");
  }

  const client_assertion_type: string | null = param("client_assertion_type");
  const client_assertion: string | null = param("client_assertion");
  if (client_assertion_type !== null || client_assertion !== null) {
    // RFC 6749 §2.3: clients MUST NOT use more than one authentication
    // method in each request.
    if (basic_credentials || param("client_secret")) {
      return invalidIntrospectionRequest(
        "Multiple client authentication methods used; send either a client secret or a client assertion, not both.",
      );
    }
    if (client_assertion_type !== OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE) {
      return invalidIntrospectionRequest(
        `Unsupported 'client_assertion_type'; expected '${OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE}'.`,
      );
    }
    if (client_assertion === null) {
      return invalidIntrospectionRequest("Missing 'client_assertion' parameter.");
    }
    return {
      ok: true,
      request: {
        token,
        credentials: {
          method: "private_key_jwt",
          client_assertion,
          client_id: param("client_id"),
        },
      },
    };
  }

  // A request identifying no client at all is an authentication failure
  // (§2.3 → RFC 6749 §5.2 401): this endpoint accepts no anonymous callers.
  const raw_client_id: string | null =
    param("client_id") ?? basic_credentials?.client_id ?? null;
  if (raw_client_id === null) {
    return invalidIntrospectionClient(
      "Client authentication is required to introspect tokens (client_secret_basic, client_secret_post or private_key_jwt).",
    );
  }
  const client_app_id = appIdSchema.safeParse(raw_client_id);
  if (!client_app_id.success) {
    return invalidIntrospectionRequest("Malformed 'client_id' parameter.");
  }

  return {
    ok: true,
    request: {
      token,
      credentials: {
        method: "client_secret",
        client_app_id: client_app_id.data,
        basic_credentials,
        post_client_secret: param("client_secret"),
      },
    },
  };
}

export default parseIntrospectionRequest;
