import type { PotentiallyValidTokenSource } from "./token-source";
import type { AuthTokenTypes } from "@/token-data";
import type { DecodeTokenFn } from "./decode-token-type";
import type { UserData } from "@/user_data";

export interface IDecodeSeveralJwtsInputOptions<TDecoded = UserData> {
  token_sources: readonly PotentiallyValidTokenSource[];
  decodeJWT: DecodeTokenFn<TDecoded>;
  jwt_audience: string;
  // Extracts the canonical UserData from a decoded value for the
  // cross-token consistency check below. Defaults to treating the decoded
  // value as UserData (identity) so callers that decode straight to
  // UserData need not supply it; callers that decode to a richer record
  // (e.g. `{ user, scope }`) pass an accessor to pick out the user.
  getUserData?: (decoded: TDecoded) => UserData;
}

export async function decodeJWTs<TDecoded = UserData>(
  {
    token_sources,
    decodeJWT,
    jwt_audience,
    getUserData = (decoded: TDecoded): UserData =>
      decoded as unknown as UserData,
  }: IDecodeSeveralJwtsInputOptions<TDecoded>,
  debug: boolean = false,
): Promise<TDecoded> {
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

  const decodeTokenPromises: Promise<TDecoded>[] = token_sources.map(function (
    token: PotentiallyValidTokenSource,
  ): Promise<TDecoded> {
    const type: AuthTokenTypes = token.type;

    const decode_promise: Promise<TDecoded> = decodeJWT({
      type,
      token: token.token,
      jwt_audience,
    });
    return decode_promise;
  });

  const decodeResults: PromiseSettledResult<TDecoded>[] =
    await Promise.allSettled(decodeTokenPromises);

  const fulfilledDecodePromises = decodeResults.filter(
    function isFulfilledPromise(
      result: PromiseSettledResult<TDecoded>,
    ): result is PromiseFulfilledResult<TDecoded> {
      return result.status === "fulfilled";
    },
  );

  const successfulDecodeResults: readonly TDecoded[] =
    fulfilledDecodePromises.map(
      (fulfilled_decode_result): TDecoded => fulfilled_decode_result.value,
    );

  const n_successful_decode_results: number = successfulDecodeResults.length;

  const successfulDecodeResult: boolean = n_successful_decode_results >= 1;

  if (debug && successfulDecodeResult) {
    console.log(
      `[decodeJWTs] Decoded ${n_successful_decode_results}/${n_token_sources satisfies number} tokens successfully.`,
    );
  }

  function describeTokenSource(source: PotentiallyValidTokenSource): string {
    const hint: string =
      typeof source.sourceHint === "string" && source.sourceHint.length > 0
        ? source.sourceHint
        : "(no source hint)";
    return `source: '${hint}', type: '${source.type}'`;
  }

  if (!successfulDecodeResult) {
    const rejectedDescriptions: string[] = [];
    const rejectionReasons: unknown[] = [];
    decodeResults.forEach((result, index) => {
      if (result.status !== "rejected") return;
      const source: PotentiallyValidTokenSource | undefined =
        token_sources[index];
      const sourceDescription: string =
        source !== undefined
          ? describeTokenSource(source)
          : `source: '(unknown, index=${index})', type: '(unknown)'`;
      const reason: unknown = result.reason;
      const reasonMessage: string =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unknown error";
      rejectedDescriptions.push(`{ ${sourceDescription}, error: ${reasonMessage} }`);
      rejectionReasons.push(reason);
    });

    const errorMessage: string =
      n_token_sources > 1
        ? `Failed to decode any of the ${n_token_sources} provided JWTs [${rejectedDescriptions.join("; ")}]`
        : `Failed to decode the single JWT that was provided! [${rejectedDescriptions.join("; ")}]`;
    console.warn(errorMessage);
    const cause: unknown =
      rejectionReasons.length === 0
        ? undefined
        : rejectionReasons.length === 1
          ? rejectionReasons[0]
          : new AggregateError(rejectionReasons, errorMessage);
    throw new Error(errorMessage, cause === undefined ? undefined : { cause });
  }

  function validateSameInfoAcrossTokens(): void {
    const uids_set: Set<string> = new Set();
    const subs_set: Set<string> = new Set();
    const emails_set: Set<string> = new Set();

    for (const decoded of successfulDecodeResults) {
      const user: UserData = getUserData(decoded);
      uids_set.add(user.uid);
      subs_set.add(user.sub);
      if (user.uid !== user.sub) {
        throw new Error("uid not equal to sub");
      }
      emails_set.add(user.email);
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
  const firstSuccessfulResult: TDecoded = successfulDecodeResults[0];

  return firstSuccessfulResult;
}

export default decodeJWTs;
