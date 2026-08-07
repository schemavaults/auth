import "server-only";
import type { ReactElement } from "react";
import type { ServerRuntime } from "next/types";
import { connection } from "next/server";
import {
  onSuccessfulAuthenticateActionSchema,
  type OnSuccessfulAuthenticateAction,
} from "@/lib/authentication_outcome_type";
import {
  parseOAuth2State,
  OAuth2StateValidationError,
} from "@schemavaults/auth-common";
import MfaChallengePageView from "./mfa-challenge-page-view";
import resolveNextHref from "@/lib/next-href";

function readString(
  searchParams: { [key: string]: string | string[] | undefined },
  key: string,
): string | undefined {
  const value = searchParams[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export default async function MfaChallengePage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<ReactElement> {
  await connection();
  const searchParams = await props.searchParams;
  const challenge_id = readString(searchParams, "challenge_id") ?? "";
  const client_app_id = readString(searchParams, "client_app_id") ?? "";
  const expires_at_raw = readString(searchParams, "expires_at");
  const expires_at_num = expires_at_raw ? Number(expires_at_raw) : undefined;

  const on_successful_authenticate_raw = readString(
    searchParams,
    "on_successful_authenticate",
  );
  const on_successful_authenticate_parsed =
    on_successful_authenticate_raw
      ? onSuccessfulAuthenticateActionSchema.safeParse(
          on_successful_authenticate_raw,
        )
      : undefined;
  const on_successful_authenticate: OnSuccessfulAuthenticateAction =
    on_successful_authenticate_parsed?.success
      ? on_successful_authenticate_parsed.data
      : "account-page";

  const redirect_uri = readString(searchParams, "redirect_uri") ?? null;
  const challenge_time_str = readString(searchParams, "challenge_time");
  const challenge_time =
    challenge_time_str && !Number.isNaN(Number(challenge_time_str))
      ? Number(challenge_time_str)
      : null;
  const code_challenge_method =
    readString(searchParams, "code_challenge_method") === "S256" ? "S256" : null;

  // Validate OAuth2 `state` at the entry boundary, identical to /auth/login.
  // A malformed value would otherwise be echoed back on the OAuth2 callback.
  let state: string | null = null;
  try {
    state = parseOAuth2State(readString(searchParams, "state"));
  } catch (e: unknown) {
    if (e instanceof OAuth2StateValidationError) {
      console.warn(
        "[MfaChallengePage] Rejecting invalid OAuth2 state:",
        e.reasons,
      );
      // Fall through with state=null; the user can still complete the
      // challenge but the third-party redirect will fail safely.
    } else {
      throw e;
    }
  }

  // Login replay nonce forwarded from the login form's query string.
  // Needed for the account-page flow's token exchange, which verifies
  // the response's nonce echo (third-party flows verify in the RP's own
  // SDK context; the server-side grant context lives on the Redis
  // challenge record).
  const nonce: string | null = readString(searchParams, "nonce") ?? null;

  // Post-login destination forwarded from the login form (originally
  // set by a route guard). Unsafe values resolve to null → /account.
  const next_href: string | null = resolveNextHref(
    readString(searchParams, "next_href"),
  );

  return (
    <MfaChallengePageView
      challenge_id={challenge_id}
      client_app_id={client_app_id}
      expires_at={
        typeof expires_at_num === "number" && !Number.isNaN(expires_at_num)
          ? expires_at_num
          : undefined
      }
      on_successful_authenticate={on_successful_authenticate}
      redirect_uri={redirect_uri}
      challenge_time={challenge_time}
      code_challenge_method={code_challenge_method}
      state={state}
      nonce={nonce}
      next_href={next_href}
    />
  );
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
