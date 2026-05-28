"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, type ReactElement } from "react";
import { MfaChallengeForm } from "@schemavaults/auth-ui";
import {
  useAppEnvironment,
  useAuth,
} from "@schemavaults/auth-react-provider";
import { useToast } from "@schemavaults/ui";
import type { OnSuccessfulAuthenticateAction } from "@/lib/authentication_outcome_type";
import { successRedirect } from "@/components/AuthForm/success-redirect";
import { useMfaChallengeFactorsStore } from "@/lib/stores/mfa-challenge-factors-store";

export interface MfaChallengePageViewProps {
  challenge_id: string;
  client_app_id: string;
  expires_at?: number;
  on_successful_authenticate: OnSuccessfulAuthenticateAction;
  redirect_uri: string | null;
  challenge_time: number | null;
  code_challenge_method: "S256" | null;
  // OAuth2 `state` (RFC 6749 §10.12) — echoed back on the third-party
  // callback URL after a successful MFA challenge so the client can
  // verify its stored CSRF nonce. Validated upstream in `page.tsx`.
  state: string | null;
}

export default function MfaChallengePageView({
  challenge_id,
  client_app_id,
  expires_at,
  on_successful_authenticate,
  redirect_uri,
  challenge_time,
  code_challenge_method,
  state,
}: MfaChallengePageViewProps): ReactElement {
  const router = useRouter();
  const env = useAppEnvironment();
  const auth = useAuth();
  const { toast } = useToast();

  const onAuthenticated = useCallback(
    async (authorization_code: string) => {
      // Resume whatever post-auth redirect would have happened on a
      // non-MFA login. Third-party PKCE / native-app flows hand the auth
      // code off to the requesting client, which redeems it themselves
      // (with their own code_verifier). The account-page flow runs the
      // SDK's own token exchange so the in-memory auth state — current
      // user, access tokens, refresh-token marker — is populated before
      // we navigate; without that, /account renders skeleton placeholders
      // forever and useAdmin() returns false.
      if (
        on_successful_authenticate === "redirect-with-authorization-code" &&
        redirect_uri &&
        typeof challenge_time === "number" &&
        code_challenge_method === "S256"
      ) {
        try {
          successRedirect({
            redirect_uri,
            authorization_code,
            code_challenge: {
              code_challenge: "",
              challenge_time,
              code_challenge_method,
            },
            app_environment: env,
            state,
          });
          return;
        } catch (e: unknown) {
          console.error("[MfaChallengePageView] successRedirect failed:", e);
          // Fall through to /account so the user is not stranded.
        }
      }

      if (
        on_successful_authenticate ===
          "send-authorization-code-to-native-app-then-close" &&
        redirect_uri &&
        typeof challenge_time === "number" &&
        code_challenge_method === "S256"
      ) {
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
          if (response.status === 200) {
            window.location.href = "/close_window";
            return;
          }
          console.error(
            "[MfaChallengePageView] Native-app code delivery failed with status:",
            response.status,
          );
        } catch (e: unknown) {
          console.error(
            "[MfaChallengePageView] Native-app code delivery threw:",
            e,
          );
        }
        // Fall through to /account on failure.
      }

      // Account-page flow: exchange the authorization_code for tokens
      // and hydrate the SDK's in-memory state, mirroring what the
      // non-MFA login does at perform-post-auth-redirect.ts → "account-page".
      const authClient = auth.ready ? auth.client.current : null;
      if (!authClient) {
        toast({
          variant: "destructive",
          title: "Auth client not ready",
          description:
            "Please refresh the page and try logging in again.",
        });
        return;
      }
      if (typeof challenge_time !== "number") {
        toast({
          variant: "destructive",
          title: "Missing challenge_time",
          description: "Please log in again to start a new MFA challenge.",
        });
        return;
      }
      const verifier = authClient.loadCodeVerifier(challenge_time);
      if (!verifier) {
        toast({
          variant: "destructive",
          title: "Missing PKCE verifier",
          description:
            "Your sign-in attempt expired. Please log in again.",
        });
        router.replace("/auth/login");
        return;
      }
      try {
        // Pass the verifier directly so the SDK does NOT take its
        // "redirect flow" branch (which would require a stored OAuth2
        // `state` nonce — account-page logins never persist one).
        await authClient.handleSuccessfulAuthentication(
          authorization_code,
          challenge_time,
          verifier,
          null,
        );
      } catch (e: unknown) {
        console.error(
          "[MfaChallengePageView] handleSuccessfulAuthentication failed:",
          e,
        );
        toast({
          variant: "destructive",
          title: "Failed to complete sign-in",
          description:
            e instanceof Error
              ? e.message
              : "An unknown error occurred while finishing your sign-in.",
        });
        return;
      }

      router.replace("/account");
    },
    [
      on_successful_authenticate,
      redirect_uri,
      challenge_time,
      code_challenge_method,
      state,
      env,
      router,
      auth,
      toast,
    ],
  );

  const clearFactors = useMfaChallengeFactorsStore((s) => s.clearFactors);

  const onChallengeExpired = useCallback(() => {
    if (challenge_id) clearFactors(challenge_id);
    router.replace("/auth/login");
  }, [challenge_id, clearFactors, router]);

  // Read the factor list from the zustand store (persisted to
  // sessionStorage). The login form wrote it there after receiving
  // `mfa_required` from /api/auth/login, so we never need a second server
  // round-trip. The store is created with `skipHydration`, so we kick off
  // rehydration from this client effect — `rehydrate()` updates the store
  // internally (no setState here), keeping SSR and the first client render
  // in agreement and avoiding a hydration mismatch.
  useEffect(() => {
    void useMfaChallengeFactorsStore.persist.rehydrate();
  }, []);
  const hasHydrated = useMfaChallengeFactorsStore((s) => s.hasHydrated);
  const payload = useMfaChallengeFactorsStore((s) =>
    challenge_id ? s.byChallengeId[challenge_id] : undefined,
  );

  if (!challenge_id || !client_app_id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <p className="text-sm text-destructive">
          Missing MFA challenge parameters. Please log in again.
        </p>
      </div>
    );
  }

  if (!hasHydrated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <p
          className="text-sm text-muted-foreground"
          data-testid="mfa-challenge-loading"
        >
          Loading verification options…
        </p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6 flex-col gap-3">
        <p className="text-sm text-destructive">
          This MFA challenge could not be loaded in this tab. Please log
          in again.
        </p>
        <button
          type="button"
          className="text-sm underline text-muted-foreground"
          onClick={() => router.replace("/auth/login")}
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <MfaChallengeForm
        challenge_id={challenge_id}
        client_app_id={client_app_id}
        expires_at={expires_at}
        available_factors={payload.available_factors}
        recovery_codes_available={payload.recovery_codes_available}
        onAuthenticated={async (authorization_code) => {
          // Drop the stashed factor list now that the challenge is
          // resolved — keeps sessionStorage tidy if the user comes back
          // through a fresh login.
          clearFactors(challenge_id);
          await onAuthenticated(authorization_code);
        }}
        onChallengeExpired={onChallengeExpired}
      />
    </div>
  );
};
