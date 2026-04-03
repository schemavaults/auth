import type { UserData } from "@/user_data";
import type { PotentiallyValidTokenSource } from "./token-source";

export interface DecodeTokenFnInputOptions extends PotentiallyValidTokenSource {
  jwt_audience: string;
}

export type DecodeTokenFn = (
  opts: DecodeTokenFnInputOptions,
) => Promise<UserData>;
