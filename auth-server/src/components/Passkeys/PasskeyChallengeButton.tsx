"use client";

import { useState, type ReactElement } from "react";
import { Button } from "@schemavaults/ui";
import { useMfa } from "@schemavaults/auth-react-provider";
import {
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import type {
  AuthenticateResult,
  WebauthnAuthenticationResponse,
} from "@schemavaults/auth-common";

export interface PasskeyChallengeButtonProps {
  challenge_id: string;
  client_app_id: string;
  // The factor the user selected in the picker (advisory; the server
  // resolves the actual credential from the signed assertion).
  factor_id: string;
  onAuthenticated: (authorization_code: string) => Promise<void> | void;
  onChallengeExpired?: () => void;
  onError: (message: string) => void;
}

// Runs the browser WebAuthn assertion ceremony to satisfy an MFA login
// challenge with a passkey. Lives in the auth server (not @schemavaults/
// auth-ui) so the @simplewebauthn/browser dependency stays out of that
// package's external consumers. Injected into MfaChallengeForm via its
// `renderPasskeyAction` slot.
export function PasskeyChallengeButton({
  challenge_id,
  client_app_id,
  factor_id,
  onAuthenticated,
  onChallengeExpired,
  onError,
}: PasskeyChallengeButtonProps): ReactElement {
  const { getWebauthnAuthenticationOptions, submitChallenge } = useMfa();
  const [busy, setBusy] = useState(false);

  const supported =
    typeof window !== "undefined" && browserSupportsWebAuthn();

  const handleClick = async (): Promise<void> => {
    setBusy(true);
    try {
      const { options } = await getWebauthnAuthenticationOptions(
        challenge_id,
        client_app_id,
      );
      const assertion = await startAuthentication({
        optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
      });
      const result: AuthenticateResult = await submitChallenge(
        challenge_id,
        client_app_id,
        {
          type: "webauthn",
          factor_id,
          assertion: assertion as unknown as WebauthnAuthenticationResponse,
        },
      );
      if (result.kind === "authenticated") {
        await onAuthenticated(result.authorization_code);
        return;
      }
      if (result.kind === "challenge_expired") {
        onError(
          result.message ||
            "Too many attempts. Please log in again to start a new challenge.",
        );
        if (onChallengeExpired) onChallengeExpired();
        return;
      }
      if (result.kind === "failure") {
        onError(result.message || "Passkey verification failed");
        return;
      }
      onError(`Unexpected response: ${result.kind}`);
    } catch (e: unknown) {
      onError(
        e instanceof Error
          ? e.message
          : "Passkey verification was cancelled or failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <p className="text-sm text-muted-foreground">
        This browser does not support passkeys. Use another factor.
      </p>
    );
  }

  return (
    <Button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy}
      data-testid="mfa-challenge-passkey-button"
      className="flex w-full flex-row gap-2 flex-nowrap"
    >
      <Fingerprint className="h-4 w-4" />
      {busy ? "Waiting for passkey…" : "Use a passkey"}
    </Button>
  );
}

export default PasskeyChallengeButton;
