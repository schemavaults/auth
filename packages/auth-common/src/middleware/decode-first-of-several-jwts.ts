import type { PotentiallyValidTokenSource } from "./token-source";
import type { AuthTokenTypes } from "@/token-data";
import type { DecodeTokenFn } from "./decode-token-type";

export interface DecodeFirstOfSeveralJwtsInputOptions {
  token_sources: readonly PotentiallyValidTokenSource[];
  decodeJWT: DecodeTokenFn;
  jwt_audience: string;
}

type DecodeTokenOutput = Awaited<ReturnType<DecodeTokenFn>>;

export async function decodeFirstOfSeveralJwts({
  token_sources,
  decodeJWT,
  jwt_audience,
}: DecodeFirstOfSeveralJwtsInputOptions): Promise<DecodeTokenOutput> {
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

  const successfulDecodeResults: readonly DecodeTokenOutput[] = decodeResults
    .filter((result) => result.status === "fulfilled")
    .map(
      (fulfilled_decode_result): DecodeTokenOutput =>
        fulfilled_decode_result.value,
    );
  const successfulDecodeResult: boolean = successfulDecodeResults.length >= 1;

  if (!successfulDecodeResult) {
    const errorMessage: string =
      n_token_sources > 1
        ? `Failed to decode any of the ${n_token_sources} provided JWTs`
        : "Failed to decode the single JWT that was provided!";
    throw new Error(errorMessage);
  }

  const uids_set: Set<string> = new Set(
    successfulDecodeResults.map((r) => r.uid),
  );
  if (uids_set.size !== 1) {
    throw new Error("Token decoding produced different user IDs!");
  }

  // All of the results should in theory contain the same data-- use the first one (arbitrary)
  console.assert(
    successfulDecodeResults.length >= 1,
    "Expected there to be at least one JWT to have been decoded successfully if this point was reached!",
  );
  const firstSuccessfulResult: DecodeTokenOutput = successfulDecodeResults[0];

  return firstSuccessfulResult;
}
