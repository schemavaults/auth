import type { AuthTokenTypes } from "@/token-data";

/** Time Variables (seconds) */
const oneMinute: number = 60 as const;
const oneHour: number = oneMinute * 60;
const oneDay: number = oneHour * 24;
const oneWeek: number = oneDay * 7;

/**
 * @description How long refresh tokens are valid for (in seconds)
 */
export const refreshTokenExpiry: number = oneWeek * 2;

/**
 * @description How long access tokens are valid for (in seconds)
 */
export const accessTokenExpiry: number = oneHour * 1.5;

/**
 * @param type Access or refresh token -- determines the expiry time
 * @returns How many seconds after the token was issued that the token is valid for
 */
function getValidDuration(type: AuthTokenTypes): number {
  let tokenValidDuration: number;
  switch (type) {
    case "refresh":
      tokenValidDuration = refreshTokenExpiry;
      break;
    case "access":
      tokenValidDuration = accessTokenExpiry;
      break;
    default:
      throw new Error("Invalid token type");
  }
  return tokenValidDuration;
}

// Expiration time (in seconds) for the JWT token. After the "issued at" time + this time, the token will be invalid.

/**
 *
 * @param type Access or refresh token -- determines the expiry time
 * @param iat The time the token was issued at (in milliseconds)
 * @returns The unix timestamp the token will expire at (in milliseconds)
 */
export function getExpiryTime(type: AuthTokenTypes, iat: number): number {
  // Get the duration (in seconds) that the token is valid for
  const tokenValidDuration: number = getValidDuration(type);
  // Convert to ms and add to iat
  return iat + tokenValidDuration * 1000;
}

/**
 *
 * @param type Access or refresh token -- determines the expiry time
 * @returns A string representing the duration that the token is valid for, parsed by the jose library
 */
export function getExpiryDurationString(type: AuthTokenTypes): string {
  return `${getValidDuration(type)}s`;
}
