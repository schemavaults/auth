"use client";

import { ErrorPage } from "@schemavaults/ui";

export default function ErrorPageView({
  error,
  message,
}: {
  error: number;
  message: string;
}) {
  return <ErrorPage error={error} message={message} />;
}
