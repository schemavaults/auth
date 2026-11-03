import "server-only";
import { appIdSchema } from "@schemavaults/app-definitions";
import { parseBasicClientCredentials } from "@/lib/oauth2/authenticate-token-endpoint-client";
import type {
  ParseRevocationRequestResult,
  RevocationRequestError,
} from "./types";

function refuse(
  error: RevocationRequestError["error"],
  error_description: string,
): ParseRevocationRequestResult {
  return { ok: false, error: { error, error_description } };
}

/**
 * Reads a revocation request (RFC 7009 §2.1): the form-encoded `token` and
 * the client it must have been issued to. Clients identify themselves as at
 * the token endpoint: by `client_id` (all a public client sends), or for a
 * confidential client with its secret via HTTP Basic (`client_secret_basic`,
 * which may carry the `client_id` by itself, RFC 6749 §2.3.1) or the
 * `client_secret` field (`client_secret_post`).
 *
 * Checks run in a fixed order so each malformed request gets one stable
 * error. `token_type_hint` is accepted but ignored: the token kind is read
 * from the token itself, which §2.1 allows. Nothing is verified here; see
 * authenticateRevocationClient() and decodeRevocableToken().
 */
export async function parseRevocationRequest(
  request: Request,
): Promise<ParseRevocationRequestResult> {
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

  // `token` is REQUIRED: omitting it is a 400, never a no-op 200.
  const token: string | null = param("token");
  if (!token) {
    return refuse("invalid_request", "Missing 'token' parameter.");
  }

  const basic_credentials = parseBasicClientCredentials(
    request.headers.get("Authorization"),
  );
  if (basic_credentials === "malformed") {
    return refuse("invalid_request", "Malformed Basic Authorization header.");
  }

  const parsed_client_id = appIdSchema.safeParse(
    param("client_id") ?? basic_credentials?.client_id ?? null,
  );
  if (!parsed_client_id.success) {
    // RFC 6749 §5.2: no client identified is `invalid_client`.
    return refuse(
      "invalid_client",
      "Missing or malformed 'client_id' parameter.",
    );
  }

  return {
    ok: true,
    request: {
      token,
      client_app_id: parsed_client_id.data,
      basic_credentials,
      post_client_secret: param("client_secret"),
    },
  };
}

export default parseRevocationRequest;
