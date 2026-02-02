"use client";

import { LoadingPage } from "@schemavaults/ui";
import { useStartRegisterOauthPKCEFlow } from "@schemavaults/auth-react-provider";
import { useToast } from "@schemavaults/ui";
import type { ReactElement } from "react";

export default function RegisterPage(): ReactElement {
  const { toast } = useToast();

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
  });

  return (
    <>
      <LoadingPage message="Commencing register flow..." />
    </>
  );
}
