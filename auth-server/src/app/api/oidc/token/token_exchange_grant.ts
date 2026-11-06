import "server-only";
import type { NextResponse } from "next/server";
import {
  isDynamicallyRegisteredClient,
  type ApiServerId,
} from "@schemavaults/app-definitions";
import { accessTokenExpiry, type UserData } from "@schemavaults/auth-common";
import type { JwtActorClaim } from "@schemavaults/jwt";
import { loadUserData, UserRegistry } from "@/lib/auth-db";
import { listApiServerScopeValues } from "@/lib/auth-db/apis";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import DelegatedTokensNotAcceptedError from "@/lib/error/DelegatedTokensNotAcceptedError";
import { listUsableApiScopeValues } from "@/lib/oauth2/api-scopes";
import issueOidcTokens, { type IssuedOidcTokens } from "@/lib/oidc/issue-oidc-tokens";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import {
  ACCESS_TOKEN_TYPE,
  TOKEN_EXCHANGE_ISSUED_TOKEN_GRANT_TYPE,
  parseTokenExchangeRequest,
  resolveDelegatedTokenExpiry,
  resolveTokenExchangeScope,
  verifyTokenExchangeSubjectToken,
} from "@/lib/oidc/token-exchange";
import {
  parseOidcTokenResourceParam,
  validateOidcTokenResource,
  type OidcTokenRequestError,
} from "@/lib/oidc/token-request-extensions";
import type { OidcGrantContext, OidcGrantOutcome } from "./token-response";

/**
 * grant_type=urn:ietf:params:oauth:grant-type:token-exchange (RFC 8693):
 * DELEGATED access tokens for agents. A confidential client presents an
 * access token one of its users holds for an API server (the
 * `subject_token`) and receives an access token for the same API server
 * on which the client's SERVICE ACCOUNT acts for that user: `sub` is still
 * the user, the RFC 8693 §4.1 `act` claim names the service account (and
 * the client it acts through). A client that runs agents for its users
 * (e.g. in a sandbox) hands the agent this token instead of the user's,
 * and the API server can tell the agent from the user.
 *
 * A delegated token never holds more than the subject token it came from:
 *
 *  - same user, same client, same audience: `resource` is optional and, if
 *    sent, must name the subject token's own audience (`invalid_target`
 *    otherwise). To act at another API server, exchange a token for that
 *    one (the refresh grant mints it with `resource`);
 *  - a subset of its scope (`scope` narrows it, as on the refresh grant;
 *    `invalid_scope` when it asks for more), minus the API scopes the user
 *    withdrew or the app lost meanwhile;
 *  - no more time: it expires when the subject token does, so the agent
 *    keeps going only while the client keeps renewing the user's token
 *    (`invalid_request` when the subject has under 30 seconds left);
 *  - no refresh token and no id_token: the client exchanges again for a
 *    fresh token, which only works while the user's own grant is live;
 *  - no life beyond the user's session: it is recorded in the session its
 *    subject token was issued in, so logout (or revoking that session's
 *    refresh token at /api/oidc/revoke) revokes it with the user's tokens.
 *
 * Who may exchange: confidential clients (they authenticated with their
 * client secret; the actor is their own machine identity), never
 * dynamically registered ones (anyone can register one anonymously, and
 * they hold no service account) — the same rules as client_credentials.
 * The API server must accept delegated tokens (`accept_delegated_tokens`,
 * set by its managers); issueOidcTokens() refuses otherwise and the grant
 * answers `invalid_target` (RFC 8693 §2.2.2). The response carries
 * `issued_token_type` (§2.2.1). The client can revoke the delegated token
 * at /api/oidc/revoke, e.g. when the agent's session ends.
 */
export async function handleOidcTokenExchangeGrant({
  dbh,
  form,
  param,
  client_app_id,
  client_app,
  client_authenticated,
  environment,
  debug,
}: OidcGrantContext): Promise<OidcGrantOutcome> {
  const fail = (response: NextResponse): OidcGrantOutcome => ({
    ok: false,
    response,
  });
  const failWith = ({ error, error_description }: OidcTokenRequestError): OidcGrantOutcome =>
    fail(oidcTokenErrorResponse(error, error_description));

  if (!client_authenticated) {
    return fail(
      oidcTokenErrorResponse(
        "unauthorized_client",
        "The token exchange grant is only available to confidential clients; register a client secret for this app and authenticate with it.",
      ),
    );
  }
  // A client secret implies an APPS row; fail closed if it vanished.
  if (client_app === null) {
    return fail(oidcTokenErrorResponse("unauthorized_client", "Unknown client application."));
  }
  if (isDynamicallyRegisteredClient(client_app)) {
    return fail(
      oidcTokenErrorResponse(
        "unauthorized_client",
        "The token exchange grant is not available to dynamically registered clients.",
      ),
    );
  }

  const parsed = parseTokenExchangeRequest(param);
  if (!parsed.ok) {
    return failWith(parsed.error);
  }
  const parsed_resource = parseOidcTokenResourceParam(form, environment);
  if (!parsed_resource.ok) {
    return failWith(parsed_resource.error);
  }

  const subject = await verifyTokenExchangeSubjectToken({
    dbh,
    subject_token: parsed.request.subject_token,
    client_app_id,
    environment,
    debug,
  });
  if (!subject.ok) {
    return failWith(subject.error);
  }
  // Decoders report `exp` (jwt >= 0.17.0); without it, the latest the
  // subject token could expire.
  const expiry = resolveDelegatedTokenExpiry({
    subject_token_exp: subject.payload.exp ?? subject.payload.iat + accessTokenExpiry,
  });
  if (!expiry.ok) {
    return failWith(expiry.error);
  }
  if (
    parsed_resource.resource !== null &&
    parsed_resource.resource !== subject.token_audience
  ) {
    return fail(
      oidcTokenErrorResponse(
        "invalid_target",
        "A delegated token is minted for the subject token's own audience; omit 'resource' or send that audience.",
      ),
    );
  }

  const user: UserData = await loadUserData(subject.payload.uid, new UserRegistry(dbh.db, debug));
  if (user.disabled) {
    return fail(oidcTokenErrorResponse("invalid_request", "Account is disabled."));
  }

  // The same `resource` rules as every other grant (the user authorizes
  // the client, the client is connected to the API server), resolved to
  // the keyset owner the subject token was decrypted with.
  const validated_resource = await validateOidcTokenResource({
    uid: user.uid,
    client_app_id,
    resource: subject.token_audience,
    dbh,
    environment,
    debug,
  });
  if (!validated_resource.ok) {
    return failWith(validated_resource.error);
  }
  const api_server_id: ApiServerId = validated_resource.api_server_id;
  if (api_server_id !== subject.api_server_id) {
    return fail(
      oidcTokenErrorResponse(
        "invalid_target",
        "The subject token's audience no longer identifies the API server it was minted for.",
      ),
    );
  }

  const [defined_api_scopes, usable_api_scopes] = await Promise.all([
    listApiServerScopeValues(dbh.db, api_server_id).then((values) => new Set(values)),
    listUsableApiScopeValues(dbh, { uid: user.uid, client_app_id, api_server_id }),
  ]);
  const scope = resolveTokenExchangeScope({
    subject_scope: subject.payload.scope,
    requested_scope: param("scope"),
    api_server_id,
    defined_api_scopes,
    usable_api_scopes,
  });
  if (!scope.ok) {
    return fail(
      scope.reason === "malformed"
        ? oidcTokenErrorResponse("invalid_scope", "Malformed 'scope' parameter.")
        : oidcTokenErrorResponse("invalid_scope", "Requested scope exceeds the subject token's scope."),
    );
  }

  // The actor: the client's own machine identity, created on first use as
  // on the client_credentials grant. Disabling it cuts the client's agents
  // off along with its M2M access.
  const { user: service_account } = await new SchemaVaultsAppRegistry(dbh.db).getOrCreateServiceAccount(
    client_app_id,
    debug,
  );
  if (service_account.disabled) {
    return fail(
      oidcTokenErrorResponse(
        "unauthorized_client",
        "The service account for this client application is disabled.",
      ),
    );
  }
  const actor: JwtActorClaim = { sub: service_account.uid, client_id: client_app_id };

  let issued: IssuedOidcTokens;
  try {
    issued = await issueOidcTokens({
      dbh,
      user,
      client_app_id,
      scope: scope.scope,
      nonce: null,
      grant_type: TOKEN_EXCHANGE_ISSUED_TOKEN_GRANT_TYPE,
      environment,
      include_id_token: false,
      issue_refresh_token: false,
      access_token_audience: validated_resource.access_token_audience,
      access_token_audience_api_server_id: api_server_id,
      actor,
      access_token_expires_at: expiry.expires_at,
      session_refresh_jti: subject.session_refresh_jti,
      debug,
    });
  } catch (e: unknown) {
    if (e instanceof DelegatedTokensNotAcceptedError) {
      return fail(
        oidcTokenErrorResponse(
          "invalid_target",
          "The API server does not accept delegated tokens; its managers can turn them on.",
        ),
      );
    }
    throw e;
  }
  issued.body.issued_token_type = ACCESS_TOKEN_TYPE;
  return { ok: true, issued };
}

export default handleOidcTokenExchangeGrant;
