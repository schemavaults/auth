"use client";

import { LoadingPage, useToast } from "@schemavaults/ui";
import { useStartLoginOauthPKCEFlow } from "@schemavaults/auth-react-provider";
import { useSearchParams } from "next/navigation";
import { type ReactElement, Suspense } from "react";

function LoginFlow(): ReactElement {
  const { toast } = useToast();
  // The page a route guard turned the user away from, to return them to
  // once they have signed in.
  const next_href: string | null = useSearchParams().get("next_href");

  function onError(e: unknown): void {
    toast({
      variant: "destructive",
      title: "Error starting login flow",
      description:
        e instanceof Error ? e.message : "An unknown error has occurred!",
    });
    return;
  }

  useStartLoginOauthPKCEFlow({ onError, next_href });

  return (
    <>
      <LoadingPage message="Commencing login flow..." />
    </>
  );
}

export default function LoginPage(): ReactElement {
  return (
    <Suspense fallback={<LoadingPage message="Commencing login flow..." />}>
      <LoginFlow />
    </Suspense>
  );
}
