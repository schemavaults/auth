import type { PotentiallyValidTokenSource } from "@schemavaults/auth-common";

export default function assertValidTokenSourcesArray(
  token_sources: readonly PotentiallyValidTokenSource[],
): void {
  if (!Array.isArray(token_sources)) {
    throw new TypeError("Expected 'token_sources' to be an array!");
  }

  for (const token_source of token_sources) {
    if (
      typeof token_source.sourceHint !== "string" &&
      typeof token_source.sourceHint !== "undefined"
    ) {
      throw new TypeError(
        "Expected token 'sourceHint' to be a string, if supplied.",
      );
    } else if (typeof token_source.token !== "string") {
      throw new TypeError(
        "Expected 'token' to be a string in token source object!",
      );
    } else if (
      token_source.type !== "refresh" &&
      token_source.type !== "access"
    ) {
      throw new TypeError("Expected token 'type' to be 'refresh' or 'access'!");
    }
  }
}
