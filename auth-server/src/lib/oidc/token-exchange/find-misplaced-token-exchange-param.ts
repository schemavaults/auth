// NOT server-only: a pure function over the form accessor (unit tested
// under `bun test`).

import { OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM } from "@schemavaults/auth-common";
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

/**
 * The other grants' parameters a token exchange request may not carry: the
 * authorization_code grant's (`code`, `code_verifier`, `redirect_uri`), the
 * refresh_token grant's (`refresh_token`), and the refresh token delivery
 * extension (a token exchange issues no refresh token). The parameters
 * every grant shares (`client_id`, `client_secret`, `scope`, `resource`)
 * stay allowed.
 */
export const PARAMS_NOT_ALLOWED_WITH_TOKEN_EXCHANGE = [
  "code",
  "code_verifier",
  "redirect_uri",
  "refresh_token",
  OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM,
] as const;

/** A parameter sent with the wrong grant, and the error to answer it with. */
export interface MisplacedTokenExchangeParam {
  name: string;
  /** The `invalid_request` error_description naming the parameter. */
  error_description: string;
}

/**
 * The first parameter a token endpoint request carries for the wrong side
 * of the token exchange grant, or null:
 *
 *  - on a request for any other grant, an RFC 8693 parameter
 *    ({@link TOKEN_EXCHANGE_ONLY_PARAMS}): a client sending a
 *    `subject_token` with a refresh grant (say) expects an exchange it is
 *    not getting;
 *  - on a token exchange request, another grant's parameter
 *    ({@link PARAMS_NOT_ALLOWED_WITH_TOKEN_EXCHANGE}): a client sending a
 *    `refresh_token` with it is mixing two grants up.
 *
 * The token endpoint refuses either with `invalid_request` instead of
 * ignoring the parameter. RFC 6749 §3.2 only asks servers to ignore
 * UNRECOGNIZED parameters; these are recognized ones sent with the wrong
 * grant (§5.2 `invalid_request`). Empty values count as absent, as
 * everywhere on the token endpoint.
 */
export function findMisplacedTokenExchangeParam(
  grant_type: TokenEndpointGrantType,
  param: TokenExchangeFormParam,
): MisplacedTokenExchangeParam | null {
  if (grant_type === TOKEN_EXCHANGE_GRANT_TYPE) {
    const name = PARAMS_NOT_ALLOWED_WITH_TOKEN_EXCHANGE.find((n) => param(n) !== null);
    return name === undefined
      ? null
      : {
          name,
          error_description: `'${name}' is not allowed with grant_type=${TOKEN_EXCHANGE_GRANT_TYPE}.`,
        };
  }
  const name = TOKEN_EXCHANGE_ONLY_PARAMS.find((n) => param(n) !== null);
  return name === undefined
    ? null
    : {
        name,
        error_description: `'${name}' is only allowed with grant_type=${TOKEN_EXCHANGE_GRANT_TYPE}.`,
      };
}

export default findMisplacedTokenExchangeParam;
