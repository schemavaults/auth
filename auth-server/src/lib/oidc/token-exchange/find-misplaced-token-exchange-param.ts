// NOT server-only: a pure function over the form accessor (unit tested
// under `bun test`).

import type { TokenEndpointGrantType } from "@/lib/oauth2/client-grant-types";
import { TOKEN_EXCHANGE_GRANT_TYPE } from "./token-exchange-constants";
import type { TokenExchangeFormParam } from "./parse-token-exchange-request";

/**
 * The RFC 8693 §2.1 request parameters only a token exchange request may
 * carry. `audience` is not among them: it is RFC 8693's too, but many
 * OAuth client libraries send it with every grant, so the other grants keep
 * ignoring it (the token exchange grant itself refuses it).
 */
export const TOKEN_EXCHANGE_ONLY_PARAMS = [
  "subject_token",
  "subject_token_type",
  "requested_token_type",
  "actor_token",
  "actor_token_type",
] as const;

export type TokenExchangeOnlyParam = (typeof TOKEN_EXCHANGE_ONLY_PARAMS)[number];

/**
 * The first token-exchange-only parameter a request for ANOTHER grant
 * carries, or null. The token endpoint refuses such a request with
 * `invalid_request` instead of ignoring the parameter: a client that sends
 * a `subject_token` with a refresh grant (say) expects an exchange it is
 * not getting. RFC 6749 §3.2 only asks servers to ignore UNRECOGNIZED
 * parameters; these are recognized, just sent with the wrong grant (§5.2
 * `invalid_request`). Empty values count as absent, as everywhere on the
 * token endpoint.
 */
export function findMisplacedTokenExchangeParam(
  grant_type: TokenEndpointGrantType,
  param: TokenExchangeFormParam,
): TokenExchangeOnlyParam | null {
  if (grant_type === TOKEN_EXCHANGE_GRANT_TYPE) {
    return null;
  }
  return TOKEN_EXCHANGE_ONLY_PARAMS.find((name) => param(name) !== null) ?? null;
}

export default findMisplacedTokenExchangeParam;
