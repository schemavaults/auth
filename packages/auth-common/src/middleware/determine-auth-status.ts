import type { UserData } from "@/user_data";
import { decodeFirstOfSeveralJwts } from "./decode-first-of-several-jwts";
import type { DecodeTokenFn } from "./decode-token-type";
import type { AuthenticationStatus } from "./middleware-rules";
import type { PotentiallyValidTokenSource } from "./token-source";

export interface DetermineAuthStatusInputOptions {
  user_data?: UserData;
  token_sources?: readonly PotentiallyValidTokenSource[];

  // type of client
  client_type: "server" | "client";

  jwt_audience?: string;
  decodeJWT?: DecodeTokenFn;

  debug?: boolean;
}

export async function determineAuthStatus(
  opts: DetermineAuthStatusInputOptions,
): Promise<AuthenticationStatus> {
  const debug: boolean = opts.debug ?? false;
  if (debug) {
    console.log(
      "[determineAuthStatus] Determining auth status with options: ",
      opts,
    );
  }

  if (!opts.token_sources || !Array.isArray(opts.token_sources)) {
    if (debug) {
      console.warn("[determineAuthStatus] No token sources provided");
    }
    return {
      status: "logged-out",
    };
  }

  // Consider yourself authenticated on the frontend if you have any tokens saved
  // Actually validate the token on the backend
  if (opts.client_type === "client") {
    // this validation is really loose!! if they think they're logged in that's good enough-- server will actually check and tell them
    if (
      (Array.isArray(opts.token_sources) && opts.token_sources.length >= 1) ||
      opts.user_data
    ) {
      const loggedInDetermination = {
        status: "logged-in",
        admin: opts.user_data?.admin ?? false,
      } as const;

      if (debug) {
        console.log(
          "[determineAuthStatus] Determined user has tokens and is probably logged in: ",
          loggedInDetermination,
        );
      }

      return loggedInDetermination;
    } else {
      if (debug) {
        console.warn(
          "[determineAuthStatus] Client does not appear to have any tokens or user data stored! Treating as unauthenticated!",
        );
      }
    }
  } else if (opts.client_type === "server") {
    // Actually validate the token

    // Use a `decodeJWT` function that is only available on the server-side
    if (typeof opts.decodeJWT !== "function") {
      throw new Error("Expected decodeJWT function server-side");
    }

    const jwt_audience = opts.jwt_audience;
    if (typeof jwt_audience !== "string") {
      throw new Error(
        "JWT audience must be set for determineAuthStatus in a server environment!",
      );
    }

    // if no jwt tokens were provided then they are unauthenticated
    if (!Array.isArray(opts.token_sources) || opts.token_sources.length === 0) {
      return {
        status: "logged-out",
      } as const;
    }

    const token_sources: readonly PotentiallyValidTokenSource[] =
      opts.token_sources;

    let decoded_jwt: UserData;
    try {
      const decoded = await decodeFirstOfSeveralJwts(
        {
          token_sources,
          decodeJWT: opts.decodeJWT,
          jwt_audience,
        },
        debug,
      );
      if (typeof decoded === "object" && !!decoded) {
        decoded_jwt = decoded;
      } else {
        throw new Error("Failed to decode JWT into user data");
      }
    } catch (e: unknown) {
      console.error("[determineAuthStatus] Error decoding JWT: ", e);
      return {
        status: "logged-out",
      } as const;
    }

    if (typeof decoded_jwt !== "object")
      throw new Error("Expected decoded jwt to be an object");
    const admin: boolean = Object.hasOwn(decoded_jwt, "admin")
      ? (decoded_jwt.admin ?? false)
      : false;
    return {
      status: "logged-in",
      admin,
    } as const;
  } else {
    throw new Error(
      "Invalid environment to run auth middleware auth status determination: " +
        opts.client_type,
    );
  }

  return {
    status: "logged-out",
  } as const;
}
