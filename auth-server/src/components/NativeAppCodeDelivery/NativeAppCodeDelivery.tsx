"use client";

import { useEffect, useState } from "react";
import { ErrorPage, LoadingPage } from "@schemavaults/ui";

export interface NativeAppCodeDeliveryProps {
  authorization_code: string;
  redirect_uri: string;
  code_challenge_method: "S256";
  challenge_time: number;
}

export function NativeAppCodeDelivery({
  authorization_code,
  redirect_uri,
  code_challenge_method,
  challenge_time,
}: NativeAppCodeDeliveryProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function deliverCode(): Promise<void> {
      try {
        const response = await fetch(redirect_uri, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code_challenge_method,
            challenge_time: challenge_time.toString(),
            authorization_code,
          }),
        });

        if (cancelled) return;

        if (response.status !== 200) {
          setError("Failed to deliver authorization code to the application.");
          return;
        }

        window.location.href = "/close_window";
      } catch {
        if (!cancelled) {
          setError("Failed to deliver authorization code to the application.");
        }
      }
    }

    deliverCode();

    return () => {
      cancelled = true;
    };
  }, [authorization_code, redirect_uri, code_challenge_method, challenge_time]);

  if (error) {
    return <ErrorPage error="authorization_failed" message={error} />;
  }

  return <LoadingPage message="Completing authorization..." />;
}

export default NativeAppCodeDelivery;
