import "server-only";
import { z } from "zod";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  createAudienceSchema,
  OIDC_TOKEN_RESOURCE_PARAM,
} from "@schemavaults/auth-common";
import type { OidcTokenRequestError } from "./oidc-token-request-error";

export type ParsedOidcTokenResource =
  | { ok: true; resource: string | null }
  | { ok: false; error: OidcTokenRequestError };

/**
 * Reads the RFC 8707 `resource` parameter(s) off the token request form.
 *
 * Absent → `null` (plain OIDC behavior: userinfo-audience access token).
 * One value → validated against the platform's audience schema (the auth
 * server URL, or an API server id; the bare auth app id is rejected, as
 * everywhere else). More than one → `invalid_target`: the platform
 * issues one encrypted access token per audience, so it "only supports
 * issuing an access token with a single audience" (RFC 8707 §2) and the
 * client must send one token request per resource.
 */
export function parseOidcTokenResourceParam(
  form: FormData,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): ParsedOidcTokenResource {
  const values: string[] = form
    .getAll(OIDC_TOKEN_RESOURCE_PARAM)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (values.length === 0) {
    return { ok: true, resource: null };
  }
  if (values.length > 1) {
    return {
      ok: false,
      error: {
        error: "invalid_target",
        error_description:
          "This authorization server issues one access token per token request; send a single 'resource' parameter.",
      },
    };
  }

  const parsed = createAudienceSchema(z, environment).safeParse(values[0]);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        error: "invalid_target",
        error_description:
          "The 'resource' parameter must be the auth server URL or a registered API server id.",
      },
    };
  }
  return { ok: true, resource: parsed.data };
}

export default parseOidcTokenResourceParam;
