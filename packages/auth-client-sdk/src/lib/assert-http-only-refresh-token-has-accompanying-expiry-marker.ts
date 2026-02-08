import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export default function assertHttpOnlyRefreshTokenCookieHasAccompanyingMarkerCookie(
  adapter: ISchemaVaultsAuthClientAdapter,
): void {
  if (
    typeof adapter.hasHttpOnlyRefreshToken === "function" &&
    !adapter.hasHttpOnlyRefreshToken()
  ) {
    throw new Error(
      "Adapter does not indicate having an HTTP-only refresh token after exchange," +
        " " +
        "despite response of AS_HTTP_ONLY_COOKIE!",
    );
  }
}
