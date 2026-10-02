import "server-only";

/**
 * The issuer (`iss`) of a client assertion, read WITHOUT verifying it: it
 * only names the API server whose JWKS access key the assertion is then
 * verified against. Returns null when the assertion is not a JWT with a
 * string `iss`.
 */
export function getUnverifiedAssertionIssuer(assertion: string): string | null {
  const parts: string[] = assertion.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    if (
      typeof payload === "object" &&
      payload !== null &&
      "iss" in payload &&
      typeof payload.iss === "string"
    ) {
      return payload.iss;
    }
  } catch {
    // Not a JWT.
  }
  return null;
}

export default getUnverifiedAssertionIssuer;
