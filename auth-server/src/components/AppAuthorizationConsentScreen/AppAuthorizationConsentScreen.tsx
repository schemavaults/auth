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
  cn,
  useToast,
} from "@schemavaults/ui";
import { ThemedPageBackground } from "@/components/ThemedPageBackground";
import { useAuthServerFriendlyName } from "@/components/Wordmark";
import { useAuth, useAppEnvironment } from "@schemavaults/auth-react-provider";
import { useRouter, useSearchParams } from "next/navigation";
import type { OnSuccessfulAuthenticateAction } from "@/lib/authentication_outcome_type";
import { successRedirect } from "@/components/AuthForm/success-redirect";
import { closeWindowRedirect } from "@/components/AuthForm/close-window-redirect";
import { Loader2, ShieldCheck, X } from "lucide-react";
import type { PendingAuthorizationState } from "@/components/AuthForm/handle-auth-form-submit";
import { isPkceChallengeExpired } from "@schemavaults/auth-common/pkce/is_pkce_challenge_expired.js";
import {
  DEFAULT_AUTH_SCOPE,
  OAuth2StateValidationError,
  SYNTHESIZED_NONCE_PREFIX,
  parseOAuth2State,
} from "@schemavaults/auth-common";
import uuidSync from "@/lib/uuid/uuidSync";

export interface AppAuthorizationConsentScreenProps {
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
  const friendly_name: string = useAuthServerFriendlyName();
  const [submitting, startSubmitting] = useTransition();

  function handleDeny(): void {
    router.push("/account");
    return;
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

    // Step 1: Authorize the app. Pass the URL `state` through for API
    // hygiene — the server does not persist it, but accepting it here
    // formalizes the contract and lets us log it in development. A
    // malformed value fails the flow with a destructive toast rather
    // than being round-tripped to the server.
    let urlState: string | null;
    try {
      urlState = parseOAuth2State(searchParams.get("state"));
    } catch (e: unknown) {
      if (e instanceof OAuth2StateValidationError) {
        toast({
          variant: "destructive",
          title: "Invalid OAuth2 state",
          description:
            "The OAuth2 'state' parameter was malformed. Please restart the flow from the requesting app.",
        });
        return;
      }
      throw e;
    }
    try {
      await authClient.sendAuthorizeClientApplicationRequest(app_id, urlState);
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
      // Already validated in Step 1 above, but re-parse so a second
      // read survives code-refactor reordering. Throws on malformed;
      // the outer try/catch surfaces a destructive toast.
      const state = parseOAuth2State(searchParams.get("state"));
      // Grant context — first-class on every mint. URL values when the
      // flow supplied them; platform fallbacks otherwise (mirrors
      // handle-auth-form-submit.ts).
      const url_nonce = searchParams.get("nonce");
      // uuidSync() (not crypto.randomUUID) for the insecure-browser-context
      // fallback — see handle-auth-form-submit.ts.
      const flow_nonce: string =
        url_nonce && url_nonce.length > 0
          ? url_nonce
          : `${SYNTHESIZED_NONCE_PREFIX}${uuidSync()}`;
      const url_scope = searchParams.get("scope");
      const flow_scope: string =
        url_scope && url_scope.length > 0 ? url_scope : DEFAULT_AUTH_SCOPE;

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

      if (isPkceChallengeExpired(challenge_time)) {
        window.location.href = "/error?error=400&error_id=pkce_challenge_expired";
        return;
      }

      const endpoint = new URL(
        "/api/auth/session/generate-authorization-code",
        authClient.auth_server_url
      );

      // Generate authorization code via session endpoint. The
      // `redirect_uri` must be sent so the server can bind the code to
      // it (the endpoint refuses third-party mints without one).
      const response = await fetch(
        endpoint,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_app_id: app_id,
            code_challenge,
            code_challenge_method: "S256",
            challenge_time,
            ...(redirect_uri ? { redirect_uri } : {}),
            nonce: flow_nonce,
            scope: flow_scope,
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
          state,
          issuer: authClient.auth_server_url,
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
            ...(typeof state === "string" && state.length > 0
              ? { state }
              : {}),
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
          <strong>{app_name}</strong> wants to access your {friendly_name}{" "}
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
