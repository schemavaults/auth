// JwtDecodingKeysetNotFoundError.ts

import isValidUuid from "@/is-valid-uuid";

/**
 * @description Thrown when a JWT keyset with a given 'keyset_id' cannot be found!
 */
export class JwtDecodingKeysetNotFoundError extends Error {
  public readonly keyset_id: string;

  public constructor(keyset_id: string, message: string) {
    super(message);
    if (typeof keyset_id !== "string" || !isValidUuid(keyset_id)) {
      throw new TypeError(
        "Expected first argument to JwtDecodingKeysetNotFoundError to be a 'keyset_id' UUID string",
      );
    } else if (typeof message !== "string") {
      throw new TypeError(
        "Expected second argument to JwtDecodingKeysetNotFoundError to be a 'message' string!",
      );
    }
    this.keyset_id = keyset_id;
  }
}

export default JwtDecodingKeysetNotFoundError;
