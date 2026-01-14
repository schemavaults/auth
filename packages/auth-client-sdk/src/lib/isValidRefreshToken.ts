import { type RefreshToken, refreshTokenDataSchema } from "@schemavaults/auth-common";


export default function isValidRefreshToken(val: unknown): val is RefreshToken {
  const parsed = refreshTokenDataSchema.safeParse(val)
  if (!parsed.success) {
    return false;
  }
  if (parsed.data.exp < Date.now()) {
    console.warn("[isValidRefreshToken] Refresh token is expired.");
    return false;
  }

  return true;
}