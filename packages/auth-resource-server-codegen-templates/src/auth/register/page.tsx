"use client";

import { LoadingPage } from "@schemavaults/ui";
import { useStartRegisterOauthPKCEFlow } from "@schemavaults/auth-react-provider";
import { useToast } from "@schemavaults/ui";
import { useSearchParams } from "next/navigation";
import { type ReactElement, Suspense } from "react";

function RegisterFlow(): ReactElement {
  const { toast } = useToast();
  // The page to return the user to once they have registered.
  const next_href: string | null = useSearchParams().get("next_href");

  function onError(e: unknown): void {
    toast({
      variant: "destructive",
      title: "Error starting register flow!",
      description:
        e instanceof Error ? e.message : "An unknown error has occurred!",
    });
  }

  useStartRegisterOauthPKCEFlow({
    onError,
    next_href,
  });

  return (
    <>
      <LoadingPage message="Commencing register flow..." />
    </>
  );
}

export default function RegisterPage(): ReactElement {
  return (
    <Suspense fallback={<LoadingPage message="Commencing register flow..." />}>
      <RegisterFlow />
    </Suspense>
  );
}
