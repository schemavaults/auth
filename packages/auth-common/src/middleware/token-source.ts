import type { AuthTokenTypes } from "@/token-data";

export interface PotentiallyValidTokenSource {
  type: AuthTokenTypes;
  token: string;

  // Where did this token come from? E.g. cookie abc, header xyz
  sourceHint?: string;
}
