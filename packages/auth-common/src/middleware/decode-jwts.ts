import type { PotentiallyValidTokenSource } from "./token-source";
import type { AuthTokenTypes } from "@/token-data";
import type { DecodeTokenFn } from "./decode-token-type";

export interface IDecodeSeveralJwtsInputOptions {
  token_sources: readonly PotentiallyValidTokenSource[];
  decodeJWT: DecodeTokenFn;
  jwt_audience: string;
}

type DecodeTokenOutput = Awaited<ReturnType<DecodeTokenFn>>;

export async function decodeJWTs(
  { token_sources, decodeJWT, jwt_audience }: IDecodeSeveralJwtsInputOptions,
  debug: boolean = false,
): Promise<DecodeTokenOutput> {
  const n_token_sources: number = token_sources.length;
  if (!Array.isArray(token_sources) || n_token_sources === 0) {
    throw new Error("Did not receive a list of tokens to decode");
  }
  console.assert(
    typeof n_token_sources === "number" && n_token_sources > 0,
    "Expected there to be at least 1 potentially valid token if this point was reached!",
  );

  if (typeof jwt_audience !== "string") {
    throw new Error("JWT audience is not a string!");
  }

  const decodeTokenPromises: Promise<DecodeTokenOutput>[] = token_sources.map(
    function (token: PotentiallyValidTokenSource): Promise<DecodeTokenOutput> {
      const type: AuthTokenTypes = token.type;

      const decode_promise: Promise<DecodeTokenOutput> = decodeJWT({
        type,
        token: token.token,
        jwt_audience,
      });
      return decode_promise;
    },
  );

  const decodeResults: PromiseSettledResult<DecodeTokenOutput>[] =
    await Promise.allSettled(decodeTokenPromises);

  const fulfilledDecodePromises = decodeResults.filter(
    function isFulfilledPromise(
      result: PromiseSettledResult<DecodeTokenOutput>,
    ): result is PromiseFulfilledResult<DecodeTokenOutput> {
      return result.status === "fulfilled";
    },
  );

  const successfulDecodeResults: readonly DecodeTokenOutput[] =
    fulfilledDecodePromises.map(
      (fulfilled_decode_result): DecodeTokenOutput =>
        fulfilled_decode_result.value,
    );

  const n_successful_decode_results: number = successfulDecodeResults.length;

  const successfulDecodeResult: boolean = n_successful_decode_results >= 1;

  if (debug && successfulDecodeResult) {
    console.log(
      `[decodeJWTs] Decoded ${n_successful_decode_results}/${n_token_sources satisfies number} tokens successfully.`,
    );
  }

  if (!successfulDecodeResult) {
    const errorMessage: string =
      n_token_sources > 1
        ? `Failed to decode any of the ${n_token_sources} provided JWTs`
        : "Failed to decode the single JWT that was provided!";
    console.warn(errorMessage);
    throw new Error(errorMessage);
  }

  function validateSameInfoAcrossTokens(): void {
    const uids_set: Set<string> = new Set();
    const subs_set: Set<string> = new Set();
    const emails_set: Set<string> = new Set();

    for (const decoded of successfulDecodeResults) {
      uids_set.add(decoded.uid);
      subs_set.add(decoded.sub);
      if (decoded.uid !== decoded.sub) {
        throw new Error("uid not equal to sub");
      }
      emails_set.add(decoded.email);
    }
    if (uids_set.size !== 1 || subs_set.size !== 1) {
      throw new Error("Token decoding produced different user IDs!");
    } else if (emails_set.size !== 1) {
      throw new Error("Token decoding produced different user emails!");
    }
  }
  validateSameInfoAcrossTokens();

  // All of the results should in theory contain the same data-- use the first one (arbitrary)
  console.assert(
    n_successful_decode_results >= 1,
    "Expected there to be at least one JWT to have been decoded successfully if this point was reached!",
  );
  const firstSuccessfulResult: DecodeTokenOutput = successfulDecodeResults[0];

  return firstSuccessfulResult;
}

export default decodeJWTs;
