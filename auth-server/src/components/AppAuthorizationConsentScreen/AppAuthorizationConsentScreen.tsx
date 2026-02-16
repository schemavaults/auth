"use client";

import { type ReactElement, useTransition } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ThemedPageBackground,
  cn,
  useToast,
} from "@schemavaults/ui";
import { useAuth, useAppEnvironment } from "@schemavaults/auth-react-provider";
import { useRouter, useSearchParams } from "next/navigation";
import type { OnSuccessfulAuthenticateAction } from "@/lib/authentication_outcome_type";
import { successRedirect } from "@/components/AuthForm/success-redirect";
import { closeWindowRedirect } from "@/components/AuthForm/close-window-redirect";
import { Loader2, ShieldCheck, X } from "lucide-react";
import type { PendingAuthorizationState } from "@/components/AuthForm/handle-auth-form-submit";

interface AppAuthorizationConsentScreenProps {
  app_id: string;
  app_name: string;
  app_description: string;
  onSuccessfulAuthenticate: OnSuccessfulAuthenticateAction;
  mode: "authorize-and-redirect" | "authorize-only";
  onAuthorizationComplete?: () => void;
  pendingAuthState?: PendingAuthorizationState;
  debug?: boolean;
}

export function AppAuthorizationConsentScreen({
  app_id,
  app_name,
  app_description,
  onSuccessfulAuthenticate,
  mode,
  onAuthorizationComplete,
  pendingAuthState: _pendingAuthState,
  debug,
}: AppAuthorizationConsentScreenProps): ReactElement {
  const { toast } = useToast();
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const appEnv = useAppEnvironment();
  const [submitting, startSubmitting] = useTransition();

  function handleDeny(): void {
    router.push("/account");
  }

  async function handleAuthorize(): Promise<void> {
    if (!auth.ready || !auth.client.current) {
      toast({
        variant: "destructive",
        title: "Auth client not ready",
        description: "Please try again later.",
      });
      return;
    }

    const authClient = auth.client.current;

    // Step 1: Authorize the app
    try {
      await authClient.sendAuthorizeClientApplicationRequest(app_id);
    } catch (e: unknown) {
      console.error("[AppAuthorizationConsentScreen] Failed to authorize app:", e);
      toast({
        variant: "destructive",
        title: "Authorization failed",
        description: "Failed to authorize the application. Please try again.",
      });
      return;
    }

    toast({
      title: "Application authorized",
      description: `You have authorized ${app_name} to access your account.`,
    });

    if (mode === "authorize-only") {
      onAuthorizationComplete?.();
      return;
    }

    // mode === "authorize-and-redirect": generate auth code and redirect
    try {
      const code_challenge = searchParams.get("code_challenge");
      const challenge_time_str = searchParams.get("challenge_time");
      const redirect_uri = searchParams.get("redirect_uri");

      if (!code_challenge) {
        throw new Error("Missing code_challenge parameter");
      }
      if (!challenge_time_str) {
        throw new Error("Missing challenge_time parameter");
      }

      const challenge_time = parseInt(challenge_time_str);
      if (isNaN(challenge_time)) {
        throw new Error("Invalid challenge_time parameter");
      }

      // Generate authorization code via session endpoint
      const response = await fetch(
        `${authClient.auth_server_uri}/api/auth/session/generate-authorization-code`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code_challenge,
            code_challenge_method: "S256",
            challenge_time,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to generate authorization code");
      }

      const data = await response.json();
      if (!data.success || !data.authorization_code) {
        throw new Error("Invalid response from authorization code endpoint");
      }

      const authorization_code: string = data.authorization_code;

      if (debug) {
        console.log(
          "[AppAuthorizationConsentScreen] Got authorization code, redirecting...",
        );
      }

      const codeChallengeDetails = {
        code_challenge,
        challenge_time,
        code_challenge_method: "S256" as const,
      };

      if (onSuccessfulAuthenticate === "redirect-with-authorization-code") {
        if (!redirect_uri) {
          throw new Error("No redirect URI provided");
        }
        successRedirect({
          redirect_uri,
          authorization_code,
          code_challenge: codeChallengeDetails,
          app_environment: appEnv,
        });
      } else if (
        onSuccessfulAuthenticate ===
        "send-authorization-code-to-native-app-then-close"
      ) {
        if (!redirect_uri) {
          throw new Error("No redirect URI provided");
        }

        const postResponse = await fetch(redirect_uri, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code_challenge_method: "S256",
            challenge_time: challenge_time.toString(),
            authorization_code,
          }),
        });

        if (postResponse.status !== 200) {
          throw new Error("Failed to send authorization code to native app");
        }

        closeWindowRedirect(authClient);
      }
    } catch (e: unknown) {
      console.error(
        "[AppAuthorizationConsentScreen] Failed to redirect:",
        e,
      );
      toast({
        variant: "destructive",
        title: "Redirect failed",
        description:
          "App was authorized but we couldn't redirect you. Please try again.",
      });
    }
  }

  const content = (
    <Card
      className={cn(
        "w-11/12 xs:w-10/12 sm:w-3/4 md:w-2/3 lg:w-1/2 xl:w-1/3",
        "bg-white",
        "md:shadow-md",
        "md:rounded-lg",
        "p-4",
        "my-16",
      )}
    >
      <CardHeader>
        <CardTitle>Authorize Application</CardTitle>
        <CardDescription>
          <strong>{app_name}</strong> wants to access your SchemaVaults
          account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{app_description}</p>
        <div className="rounded-md border p-3 bg-muted/50">
          <p className="text-sm font-medium">This application will be able to:</p>
          <ul className="list-disc list-inside text-sm text-muted-foreground mt-1">
            <li>Verify your identity</li>
            <li>Access your account information</li>
          </ul>
        </div>
      </CardContent>
      <CardFooter className="flex flex-row justify-between items-center gap-4">
        <Button
          variant="outline"
          onClick={handleDeny}
          disabled={submitting}
        >
          <X className="h-4 w-4 mr-2" />
          Deny
        </Button>
        <Button
          className="bg-green-500 hover:bg-green-400 text-white font-semibold px-4 py-2 rounded-md transition-colors duration-200 ease-in-out"
          onClick={() => {
            startSubmitting(async () => {
              await handleAuthorize();
            });
          }}
          disabled={submitting}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" role="status" />
          ) : (
            <ShieldCheck className="h-4 w-4 mr-2" />
          )}
          Authorize & Continue
        </Button>
      </CardFooter>
    </Card>
  );

  if (mode === "authorize-and-redirect") {
    return (
      <ThemedPageBackground
        className="items-center justify-center flex"
        backgroundClassName="grow min-h-[100dvh] h-full no-scrollbar"
      >
        {content}
      </ThemedPageBackground>
    );
  }

  return content;
}

export default AppAuthorizationConsentScreen;
