"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { MfaChallengeForm } from "@schemavaults/auth-ui";
import {
  useAppEnvironment,
  useAuth,
} from "@schemavaults/auth-react-provider";
import { Button, useToast } from "@schemavaults/ui";
import type { OnSuccessfulAuthenticateAction } from "@/lib/authentication_outcome_type";
import { successRedirect } from "@/components/AuthForm/success-redirect";
import { useMfaChallengeFactorsStore } from "@/lib/stores/mfa-challenge-factors-store";
import { PasskeyChallengeButton } from "@/components/Passkeys";

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
  // Login replay nonce, forwarded from the login form. The account-page
  // flow passes it into the token exchange so the response's nonce echo
  // can be verified.
  nonce?: string | null;
  // Safe same-origin path (validated by `resolveNextHref` in page.tsx)
  // to land the user on after the account-page flow completes — set
  // when a route guard bounced them to login from a protected page.
  // Null → default /account destination.
  next_href?: string | null;
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
  nonce,
  next_href,
}: MfaChallengePageViewProps): ReactElement {
  const router = useRouter();
  const env = useAppEnvironment();
  const auth = useAuth();
  const { toast } = useToast();

  // When the user has to restart the login flow, keep their original
  // destination on the login URL so the retry still lands them there.
  const login_href: string = next_href
    ? `/auth/login?next_href=${encodeURIComponent(next_href)}`
    : "/auth/login";

  // Flipped to `true` the moment a factor (or passkey) verifies
  // successfully, before we clear the stashed factor list and kick off
  // the (async) redirect / token exchange. Without it, clearing the
  // factors drops `payload` to `undefined` and the component briefly
  // re-renders the "could not be loaded in this tab" error before the
  // navigation resolves. The success branch takes priority so the user
  // only ever sees a "finishing sign-in" state during that window.
  const [succeeded, setSucceeded] = useState<boolean>(false);

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
          const authClientForIssuer = auth.ready ? auth.client.current : null;
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
            issuer: authClientForIssuer?.auth_server_url ?? null,
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
        // Verification succeeded but we can't finish: drop the success
        // screen so the toast/error UI is visible instead of a stuck
        // "Finishing sign-in…" spinner.
        setSucceeded(false);
        toast({
          variant: "destructive",
          title: "Auth client not ready",
          description:
            "Please refresh the page and try logging in again.",
        });
        return;
      }
      if (typeof challenge_time !== "number") {
        setSucceeded(false);
        toast({
          variant: "destructive",
          title: "Missing challenge_time",
          description: "Please log in again to start a new MFA challenge.",
        });
        return;
      }
      const verifier = authClient.loadCodeVerifier(challenge_time);
      if (!verifier) {
        setSucceeded(false);
        toast({
          variant: "destructive",
          title: "Missing PKCE verifier",
          description:
            "Your sign-in attempt expired. Please log in again.",
        });
        router.replace(login_href);
        return;
      }
      try {
        // Pass the verifier directly so the SDK does NOT take its
        // "redirect flow" branch (which would require a stored OAuth2
        // `state` nonce — account-page logins never persist one). The
        // login nonce (forwarded on this page's URL) lets the exchange
        // verify the token response's nonce echo.
        await authClient.handleSuccessfulAuthentication(
          authorization_code,
          challenge_time,
          verifier,
          null,
          nonce ?? null,
        );
      } catch (e: unknown) {
        setSucceeded(false);
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

      router.replace(next_href ?? "/account");
    },
    [
      on_successful_authenticate,
      redirect_uri,
      challenge_time,
      code_challenge_method,
      state,
      nonce,
      next_href,
      login_href,
      env,
      router,
      auth,
      toast,
    ],
  );

  const clearFactors = useMfaChallengeFactorsStore((s) => s.clearFactors);

  const onChallengeExpired = useCallback(() => {
    if (challenge_id) clearFactors(challenge_id);
    router.replace(login_href);
  }, [challenge_id, clearFactors, login_href, router]);

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

  // A verified factor clears the stashed factor list (dropping `payload`)
  // while the async redirect / token exchange is still in flight. Render
  // a "finishing" state here so the user never sees the missing-payload
  // error below during that window.
  if (succeeded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <p
          className="text-sm text-muted-foreground"
          data-testid="mfa-challenge-success"
        >
          Verification successful. Finishing sign-in…
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
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-sm text-muted-foreground"
          onClick={() => router.replace(login_href)}
        >
          Back to login
        </Button>
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
          // Show the success state before clearing factors so the
          // resulting `payload === undefined` re-render doesn't flash the
          // missing-payload error while the redirect is in flight.
          setSucceeded(true);
          // Drop the stashed factor list now that the challenge is
          // resolved — keeps sessionStorage tidy if the user comes back
          // through a fresh login.
          clearFactors(challenge_id);
          await onAuthenticated(authorization_code);
        }}
        onChallengeExpired={onChallengeExpired}
        renderPasskeyAction={({ factor_id, onError }) => (
          <PasskeyChallengeButton
            challenge_id={challenge_id}
            client_app_id={client_app_id}
            factor_id={factor_id}
            onError={onError}
            onAuthenticated={async (authorization_code) => {
              setSucceeded(true);
              clearFactors(challenge_id);
              await onAuthenticated(authorization_code);
            }}
            onChallengeExpired={onChallengeExpired}
          />
        )}
      />
    </div>
  );
};
