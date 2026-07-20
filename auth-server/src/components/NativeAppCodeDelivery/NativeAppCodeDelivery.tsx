"use client";

import { useEffect, useState } from "react";
import { LoadingPage } from "@schemavaults/ui";
import { ErrorPage } from "@/components/ErrorPage";

export interface NativeAppCodeDeliveryProps {
  authorization_code: string;
  redirect_uri: string;
  code_challenge_method: "S256";
  challenge_time: number;
  // OAuth2 `state` (RFC 6749 §10.12) — forwarded to native clients so
  // they can validate CSRF protection end-to-end, same as web clients.
  state?: string | null;
}

export function NativeAppCodeDelivery({
  authorization_code,
  redirect_uri,
  code_challenge_method,
  challenge_time,
  state,
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
            ...(typeof state === "string" && state.length > 0
              ? { state }
              : {}),
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
  }, [authorization_code, redirect_uri, code_challenge_method, challenge_time, state]);

  if (error) {
    return <ErrorPage error="authorization_failed" message={error} />;
  }

  return <LoadingPage message="Completing authorization..." />;
}

export default NativeAppCodeDelivery;
