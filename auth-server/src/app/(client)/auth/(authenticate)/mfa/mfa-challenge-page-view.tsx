"use client";

import { useRouter } from "next/navigation";
import { useCallback, type ReactElement } from "react";
import { MfaChallengeForm } from "@schemavaults/auth-ui";
import { useAppEnvironment } from "@schemavaults/auth-react-provider";
import type { OnSuccessfulAuthenticateAction } from "@/lib/authentication_outcome_type";
import { successRedirect } from "@/components/AuthForm/success-redirect";

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

  const onAuthenticated = useCallback(
    async (authorization_code: string) => {
      // Resume whatever post-auth redirect would have happened on a
      // non-MFA login. The MFA verify endpoint already set the
      // auth-server refresh token cookie, so account-page flows just
      // need a router push; the third-party PKCE flow needs us to
      // bounce the authorization_code back to the client's redirect_uri.
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
    ],
  );

  const onChallengeExpired = useCallback(() => {
    router.replace("/auth/login");
  }, [router]);

  if (!challenge_id || !client_app_id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <p className="text-sm text-destructive">
          Missing MFA challenge parameters. Please log in again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <MfaChallengeForm
        challenge_id={challenge_id}
        client_app_id={client_app_id}
        expires_at={expires_at}
        onAuthenticated={onAuthenticated}
        onChallengeExpired={onChallengeExpired}
      />
    </div>
  );
};
