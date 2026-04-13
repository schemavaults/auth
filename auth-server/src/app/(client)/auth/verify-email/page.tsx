import "server-only";
import type { ReactElement } from "react";
import type { ServerRuntime } from "next/types";
import VerifyEmailPageView from "./VerifyEmailPageView";
import { connection } from "next/server";

export default async function VerifyEmailPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<ReactElement> {
  await connection();

  const searchParams = await props.searchParams;

  const token: string | null =
    typeof searchParams.token === "string" ? searchParams.token : null;

  return <VerifyEmailPageView token={token} />;
}

export const runtime: ServerRuntime = "nodejs";
