"use client";

import { useLogoutEffect } from "@schemavaults/auth-react-provider";
import { LoadingPage, useToast } from "@schemavaults/ui";
import { useRouter } from "next/navigation";
import { useCallback, type ReactElement } from "react";

export function LogoutPageView(): ReactElement {
  const { toast } = useToast();
  const router = useRouter();

  const onLogoutSuccess = useCallback(
    (successful_logout_redirect_uri: string) => {
      toast({
        variant: "default",
        title: "Logged out successfully!",
        description: "Sending you back to the login page...",
      });
      router.push(successful_logout_redirect_uri);
      return;
    },
    [router, toast],
  );

  useLogoutEffect({
    onLogoutSuccess,
    onLogoutFailure(e: unknown): void {
      console.error("Failed to log out: ", e);
      const errorMessage: string =
        e instanceof Error ? e.message : "An unknown error has occurred!";
      toast({
        variant: "default",
        title: "Failed to log out!",
        description: errorMessage,
      });
      return;
    }, // end of onLogoutFailure
  });

  return <LoadingPage message="Attempting to log you out..." />;
}

export default LogoutPageView;
