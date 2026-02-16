// acquire-access-token.ts

import type { AcquireAccessTokenOptions } from "@/types/acquire-access-token-options";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  type SuccessfullyGeneratedTokensRecord,
  type AccessToken,
  type RefreshToken,
} from "@schemavaults/auth-common";
import isValidRefreshToken from "@/lib/isValidRefreshToken";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";

export interface IAcquireAccessTokenFnOptions {
  opts: AcquireAccessTokenOptions;
  adapter: ISchemaVaultsAuthClientAdapter;
  logout: () => Promise<void>;
  exchangeAuthTokens: (
    refresh: RefreshToken | "AS_HTTP_ONLY_COOKIE",
    audience: string,
    replaceRefreshToo?: boolean,
  ) => Promise<SuccessfullyGeneratedTokensRecord>;
  debug?: boolean;
}

export default async function acquireAccessToken({
  opts,
  adapter,
  logout,
  exchangeAuthTokens,
  debug,
}: IAcquireAccessTokenFnOptions): Promise<AccessToken> {
  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient] Attempting to acquire access token with opts: ",
      opts,
    );
  }

  // where is this access token for? (e.g. auth server? registry? some other API server?)
  let audience: ApiServerId;
  try {
    const parsed_audience = apiServerIdSchema.safeParse(opts.audience);
    if (!parsed_audience.success) {
      console.error(
        "Failed to parse desired audience for access token load request: ",
        parsed_audience.error,
      );
      if (debug) {
        console.error("Error resulted from audience value of: ", opts.audience);
      }
      throw parsed_audience.error;
    }
    audience = parsed_audience.data;
  } catch (e: unknown) {
    console.error(
      "Failed to parse 'audience' to request for new access token to exchange refresh token for: ",
      e,
    );
    throw new Error(
      "Failed to parse 'audience' to request for new access token to exchange refresh token for!",
    );
  }

  console.assert(
    typeof audience === "string",
    "Expected 'audience' to be a string if this point was reached!",
  );

  if (!opts.ensure_fresh) {
    const cached: AccessToken | null = adapter.getAccessToken(audience);
    if (cached) {
      if (cached.exp < Date.now() + 10 * 1000) {
        // Clear the access token from the cache
        try {
          adapter.clearAccessToken(audience);
        } catch (e: unknown) {
          console.error("Failed to clear access token from cache:", e);
        }
      } else {
        // Use access token if it doesn't expire in the next 10 seconds
        return cached;
      }
    }
    // Else, access token needs to be requested from server

    if (debug) {
      console.warn(
        "[SchemaVaultsAuthClient] Access token not in cache, must attempt to get one from auth platform...",
      );
    }
  }

  const doesSupportHttpOnlyRefreshToken: boolean =
    typeof adapter.doesSupportHttpOnlyRefreshToken === "function"
      ? adapter.doesSupportHttpOnlyRefreshToken()
      : false;
  // We might have a refresh token (that is in an HTTP-only cookie that the JS cannot access)
  const hasRefreshToken: boolean = adapter.hasRefreshToken();

  let refresh_token: RefreshToken | "AS_HTTP_ONLY_COOKIE" | null = null;

  if (opts.refresh_token) {
    if (!isValidRefreshToken(opts.refresh_token)) {
      throw new Error(
        "Invalid refresh token provided in acquireAccessToken options; bad shape or expiry time!",
      );
    }
    refresh_token = opts.refresh_token;
  } else if (hasRefreshToken && doesSupportHttpOnlyRefreshToken) {
    refresh_token = "AS_HTTP_ONLY_COOKIE";
  } else if (hasRefreshToken && !doesSupportHttpOnlyRefreshToken) {
    refresh_token = adapter.getRefreshToken();
    if (!refresh_token) {
      throw new Error(
        "Auth client adapter indicated it has a refresh token, but none could be loaded!",
      );
    }
    if (!isValidRefreshToken(refresh_token)) {
      throw new Error(
        "Invalid refresh token loaded from auth client adapter; bad shape or expiry time!",
      );
    }
  } else {
    throw new Error("No refresh token available to acquire new access token!");
  }

  if (debug && refresh_token) {
    console.log(
      "[SchemaVaultsAuthClient] Found refresh token VIA auth client adapter to use in access-token-exchange: ",
      refresh_token,
    );
  }

  if (!refresh_token) {
    if (debug) {
      console.group("Debug Info for Missing Refresh Token");
      console.log(
        "Does support HTTP-only refresh token: ",
        doesSupportHttpOnlyRefreshToken,
      );
      console.log("Has refresh token: ", hasRefreshToken);
      console.groupEnd();
    }

    throw new Error(
      "Expected a refresh token to have been successfully retrieved (or marked as having HTTP-only cookie) if this point was reached!",
    );
  }

  // refresh token => access token
  let tokens: SuccessfullyGeneratedTokensRecord;
  try {
    if (debug) {
      console.log(
        `[SchemaVaultsAuthClient] Attempting to acquire access token of audience '${audience}' with refresh token: `,
        refresh_token,
      );
    }
    tokens = await exchangeAuthTokens(refresh_token, audience);
  } catch (e: unknown) {
    if (debug) {
      console.error(
        `Failed to exchange refresh token for access token of audience: "${audience}": `,
        e,
      );
    }
    if (e instanceof Error) {
      const eMsg: string = e.message;
      if (
        eMsg.includes("token has expired") ||
        eMsg.includes("ERR_JWT_EXPIRED")
      ) {
        await logout();
        throw new Error(
          "Failed to exchange refresh token for access token; refresh token expired! We logged you out.",
        );
      }
    }

    throw new Error("Failed to exchange refresh token for access token");
  }

  const access_tokens = tokens?.access;
  if (!access_tokens)
    throw new Error(
      "No access tokens included in response from token acquisition endpoint",
    );

  const access = access_tokens[audience];
  if (!access) {
    throw new Error(
      `No access token included with the audience originally requested: "${audience}"`,
    );
  }

  if (access === "AS_HTTP_ONLY_COOKIE") {
    throw new Error(
      `Access token is HTTP-only cookie, cannot be used in client SDK`,
    );
  }

  if (!opts.dont_cache) {
    adapter.storeAccessToken(audience, access satisfies AccessToken);
  }

  if (debug) {
    console.log(
      `[SchemaVaultsAuthClient] Acquired access token of audience '${audience}':`,
      access,
    );
  }

  return access;
}
