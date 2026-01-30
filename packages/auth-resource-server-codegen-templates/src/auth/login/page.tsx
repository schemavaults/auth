"use client";

import { LoadingPage, useToast } from "@schemavaults/ui";
import { useStartLoginOauthPKCEFlow } from "@schemavaults/auth-react-provider";
import { type ReactElement } from "react";

export default function LoginPage(): ReactElement {
  const { toast } = useToast();

  function onError(e: unknown): void {
    toast({
      variant: "destructive",
      title: "Error starting login flow",
      description:
        e instanceof Error ? e.message : "An unknown error has occurred!",
    });
    return;
  }

  useStartLoginOauthPKCEFlow({ onError });

  return (
    <>
      <LoadingPage message="Commencing login flow..." />
    </>
  );
}
