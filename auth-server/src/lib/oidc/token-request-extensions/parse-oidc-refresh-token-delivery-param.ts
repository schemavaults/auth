import "server-only";
import {
  DEFAULT_OIDC_REFRESH_TOKEN_DELIVERY_MODE,
  OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM,
  oidcRefreshTokenDeliveryModeSchema,
  type OidcRefreshTokenDeliveryMode,
} from "@schemavaults/auth-common";
import type { OidcTokenRequestError } from "./oidc-token-request-error";

export type ParsedOidcRefreshTokenDelivery =
  | { ok: true; mode: OidcRefreshTokenDeliveryMode }
  | { ok: false; error: OidcTokenRequestError };

/** Reads the `refresh_token_delivery` extension parameter (default: inline). */
export function parseOidcRefreshTokenDeliveryParam(
  form: FormData,
): ParsedOidcRefreshTokenDelivery {
  const raw = form.get(OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM);
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: true, mode: DEFAULT_OIDC_REFRESH_TOKEN_DELIVERY_MODE };
  }
  const parsed = oidcRefreshTokenDeliveryModeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        error: "invalid_request",
        error_description: `Unsupported '${OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM}' value.`,
      },
    };
  }
  return { ok: true, mode: parsed.data };
}

export default parseOidcRefreshTokenDeliveryParam;
