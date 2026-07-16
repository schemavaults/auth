import type { UserData } from "@/user_data";
import type { PotentiallyValidTokenSource } from "./token-source";

export interface DecodeTokenFnInputOptions extends PotentiallyValidTokenSource {
  jwt_audience: string;
}

// Generic over the decoded value so callers can carry token-derived data
// ALONGSIDE the user (e.g. the granted `scope`) instead of folding it into
// `UserData`. Defaults to `UserData` so the middleware/auth-status callers
// that only need the user are unaffected.
export type DecodeTokenFn<TDecoded = UserData> = (
  opts: DecodeTokenFnInputOptions,
) => Promise<TDecoded>;
