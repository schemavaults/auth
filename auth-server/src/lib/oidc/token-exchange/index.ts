import "server-only";

/**
 * RFC 8693 token exchange at `POST /api/oidc/token`
 * (`grant_type=urn:ietf:params:oauth:grant-type:token-exchange`): a
 * confidential client swaps a user's access token for a DELEGATED access
 * token on which the client's service account acts for the user (`act`).
 * The grant handler is `app/api/oidc/token/token_exchange_grant.ts`; the
 * steps it chains live here:
 *
 *   - parse-token-exchange-request.ts: the RFC 8693 §2.1 parameters — pure
 *   - verify-token-exchange-subject-token.ts: the subject token is a live
 *     access token for an API server, issued to the client, for a person
 *   - resolve-token-exchange-scope.ts: the delegated token's scope, a subset
 *     of the subject token's — pure
 *
 * And for the token endpoint itself, find-misplaced-token-exchange-param.ts:
 * the RFC 8693 parameters any other grant refuses (`invalid_request`) — pure.
 */

export {
  ACCESS_TOKEN_TYPE,
  TOKEN_EXCHANGE_GRANT_TYPE,
  TOKEN_EXCHANGE_ISSUED_TOKEN_GRANT_TYPE,
} from "./token-exchange-constants";

export { parseTokenExchangeRequest } from "./parse-token-exchange-request";
export type {
  ParsedTokenExchangeRequest,
  ParseTokenExchangeRequestResult,
  TokenExchangeFormParam,
} from "./parse-token-exchange-request";

export { verifyTokenExchangeSubjectToken } from "./verify-token-exchange-subject-token";
export type {
  VerifiedTokenExchangeSubjectToken,
  VerifyTokenExchangeSubjectTokenOptions,
} from "./verify-token-exchange-subject-token";

export { resolveTokenExchangeScope } from "./resolve-token-exchange-scope";
export type { ResolveTokenExchangeScopeOptions } from "./resolve-token-exchange-scope";

export {
  TOKEN_EXCHANGE_ONLY_PARAMS,
  findMisplacedTokenExchangeParam,
} from "./find-misplaced-token-exchange-param";
export type { TokenExchangeOnlyParam } from "./find-misplaced-token-exchange-param";
