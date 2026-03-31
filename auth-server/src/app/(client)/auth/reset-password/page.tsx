import type { ReactElement } from "react";
import type { ServerRuntime } from "next/types";
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<ReactElement> {
  const searchParams = await props.searchParams;

  const token: string | null =
    typeof searchParams.token === "string" ? searchParams.token : null;

  return <ResetPasswordForm token={token} />;
}

export const runtime: ServerRuntime = "edge";
