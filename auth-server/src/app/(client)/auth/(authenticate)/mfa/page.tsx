import "server-only";
import type { ReactElement } from "react";
import type { ServerRuntime } from "next/types";
import { connection } from "next/server";
import MfaChallengePageView from "./mfa-challenge-page-view";

export default async function MfaChallengePage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<ReactElement> {
  await connection();
  const searchParams = await props.searchParams;
  const challenge_id =
    typeof searchParams.challenge_id === "string"
      ? searchParams.challenge_id
      : "";
  const client_app_id =
    typeof searchParams.client_app_id === "string"
      ? searchParams.client_app_id
      : "";
  const expires_at =
    typeof searchParams.expires_at === "string"
      ? Number(searchParams.expires_at)
      : undefined;

  return (
    <MfaChallengePageView
      challenge_id={challenge_id}
      client_app_id={client_app_id}
      expires_at={
        typeof expires_at === "number" && !Number.isNaN(expires_at)
          ? expires_at
          : undefined
      }
    />
  );
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
