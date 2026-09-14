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
import { SchemaVaultsAppRegistry, ServerlessDatabase } from "@/lib/auth-db";
import { appIdSchema, type SchemaVaultsApp } from "@schemavaults/app-definitions";
import redirectWithError from "@/lib/redirect-with-error";
import toPartialAppInfo, { type PartialAppInfo } from "@/lib/PartialAppInfo";

function readString(
  searchParams: { [key: string]: string | string[] | undefined },
  key: string,
): string | undefined {
  const value = searchParams[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Loads the client app a third-party flow hands its authorization code
 * to, as the consent screen presents it (name + description). Mirrors
 * the login page's app lookup: an unknown app is a 404, a database
 * failure a 500 — the same outcomes the login page produced for the
 * same `app_id` before the challenge started.
 */
async function loadConsentAppInfo(client_app_id: string): Promise<PartialAppInfo> {
  if (!appIdSchema.safeParse(client_app_id).success) {
    console.warn("[MfaChallengePage] Invalid 'client_app_id':", client_app_id);
    redirectWithError(400, "bad_request");
  }
  await using dbh = ServerlessDatabase.createDBH();
  let app: SchemaVaultsApp | null;
  try {
    app = await new SchemaVaultsAppRegistry(dbh.db).getApp(client_app_id);
  } catch (e: unknown) {
    console.error(
      `[MfaChallengePage] Failed to load app with ID "${client_app_id}": `,
      e,
    );
    redirectWithError(500, "internal_server_error");
  }
  if (!app) {
    console.warn("[MfaChallengePage] Client app not found:", client_app_id);
    redirectWithError(404, "app_id_not_found");
  }
  return toPartialAppInfo(app);
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

  // Third-party flows may have to show the consent screen after the
  // challenge (first sign-in to that app), which needs the app's name
  // and description. The account-page flow never asks for consent.
  const app: PartialAppInfo | null =
    on_successful_authenticate !== "account-page" && client_app_id.length > 0
      ? await loadConsentAppInfo(client_app_id)
      : null;

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
      app={app}
    />
  );
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
