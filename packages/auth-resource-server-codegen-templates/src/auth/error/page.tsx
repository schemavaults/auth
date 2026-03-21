"use client";
import { ErrorPage, LoadingPage } from "@schemavaults/ui";
import {
  ERROR_MESSAGE_CATALOG,
  isValidErrorId,
} from "@schemavaults/auth-common";
import { useSearchParams } from "next/navigation";
import { Suspense, type ReactElement } from "react";

function AuthErrorPageWithSearchParams(): ReactElement {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const errorIdParam = searchParams.get("error_id");

  let error: number = 500;
  if (errorParam) {
    const parsed = parseInt(errorParam);
    if (!isNaN(parsed) && parsed >= 400 && parsed < 600) {
      error = parsed;
    }
  }

  const error_id = errorIdParam ?? "unknown";
  const message = isValidErrorId(error_id)
    ? ERROR_MESSAGE_CATALOG[error_id]
    : "An unknown error occurred";

  return <ErrorPage error={error} message={message} />;
}

export default function AuthErrorPage(): ReactElement {
  return (
    <Suspense
      fallback={
        <LoadingPage message="There was an error! Loading error details from URL..." />
      }
    >
      <AuthErrorPageWithSearchParams />
    </Suspense>
  );
}
