import {
  DEVICE_VERIFICATION_PATH,
  DEVICE_VERIFICATION_USER_CODE_PARAM,
} from "./constants";
import { formatUserCode } from "./user-code";

function stripTrailingSlash(issuer: string): string {
  if (typeof issuer !== "string" || issuer.length === 0) {
    throw new TypeError("Expected 'issuer' to be a non-empty string!");
  }
  return issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;
}

/**
 * The `verification_uri` (RFC 8628 §3.2) of the auth server at `issuer`:
 * its `/device` page, where the user enters the user code.
 */
export function getDeviceVerificationUri(issuer: string): string {
  return `${stripTrailingSlash(issuer)}${DEVICE_VERIFICATION_PATH}`;
}

/**
 * The `verification_uri_complete` (RFC 8628 §3.3.1) for `user_code`: the
 * `/device` page with the code filled in (in its display form).
 */
export function getDeviceVerificationUriComplete(
  issuer: string,
  user_code: string,
): string {
  const url = new URL(getDeviceVerificationUri(issuer));
  url.searchParams.set(DEVICE_VERIFICATION_USER_CODE_PARAM, formatUserCode(user_code));
  return url.toString();
}
