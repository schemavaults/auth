"use client";

import { useLogoutEffect } from "@schemavaults/auth-react-provider";
import { LoadingPage, useToast } from "@schemavaults/ui";
import { ErrorPage } from "@/components/ErrorPage";
import { useRouter } from "next/navigation";
import { Component, type PropsWithChildren, type ReactNode, useCallback, type ReactElement } from "react";

function LogoutPageViewComponent(): ReactElement {
  const { toast } = useToast();
  const router = useRouter();

  const onLogoutSuccess = useCallback(
    (successful_logout_redirect_uri: string) => {
      toast({
        variant: "default",
        title: "Logged out successfully!",
        description: "Sending you back to the login page...",
      });
      if (typeof successful_logout_redirect_uri !== "string") {
        throw new TypeError(`[onLogoutSuccess] Expected 'successful_logout_redirect_uri' to be a string, received ${typeof successful_logout_redirect_uri}!`);
      }
      router.push(successful_logout_redirect_uri);
      return;
    },
    [router, toast],
  );

  const onLogoutFailure = useCallback(
    (e: unknown): void => {
      console.error("Failed to log out: ", e);
      const errorMessage: string =
        e instanceof Error ? e.message : "An unknown error has occurred!";
      toast({
        variant: "default",
        title: "Failed to log out!",
        description: errorMessage,
      });
      return;
    },
    [toast]
  );

  useLogoutEffect({
    onLogoutSuccess,
    onLogoutFailure
  });

  return <LoadingPage message="Attempting to log you out..." />;
}

interface LogoutPageErrorBoundaryProps extends PropsWithChildren {}
interface LogoutPageErrorBoundaryState {
  error: Error | null;
}

class LogoutPageErrorBoundary extends Component<LogoutPageErrorBoundaryProps, LogoutPageErrorBoundaryState> {
  public constructor(props: LogoutPageErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  public static getDerivedStateFromError(error: Error) {
    return { error };
  }

  public render(): ReactNode {
    if (this.state?.error) {
      return (
        <ErrorPage
          message="Something went wrong while logging you out... "
          error={this.state.error}
        />
      );
    }
    return this.props.children;
  }
}

export default function LogoutPageView(): ReactElement {
  return (
    <LogoutPageErrorBoundary>
      <LogoutPageViewComponent />
    </LogoutPageErrorBoundary>
  );
};
