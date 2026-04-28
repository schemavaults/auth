"use client";

import { useState, type FC, type FormEvent, type ReactElement } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
} from "@schemavaults/ui";
import { useMfa } from "@schemavaults/auth-react-provider";
import type { AuthenticateResult } from "@schemavaults/auth-common";

export interface MfaChallengeFormProps {
  challenge_id: string;
  client_app_id: string;
  expires_at?: number;
  onAuthenticated: (authorization_code: string) => Promise<void> | void;
  onChallengeExpired?: () => void;
}

export const MfaChallengeForm: FC<MfaChallengeFormProps> = ({
  challenge_id,
  client_app_id,
  expires_at,
  onAuthenticated,
  onChallengeExpired,
}): ReactElement => {
  const { submitChallenge } = useMfa();
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const proof = useRecovery
        ? ({ type: "recovery_code" as const, recovery_code: value })
        : ({ type: "totp" as const, code: value });
      const result: AuthenticateResult = await submitChallenge(
        challenge_id,
        client_app_id,
        proof,
      );
      if (result.kind === "authenticated") {
        await onAuthenticated(result.authorization_code);
        return;
      }
      if (result.kind === "failure") {
        setError(result.message || "Verification failed");
        if (onChallengeExpired) onChallengeExpired();
        return;
      }
      setError(`Unexpected response kind: ${result.kind}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit code");
    } finally {
      setSubmitting(false);
    }
  };

  const expiresLabel =
    typeof expires_at === "number"
      ? `Expires ${new Date(expires_at).toLocaleTimeString()}`
      : null;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Verify it&apos;s you</CardTitle>
        <CardDescription>
          {useRecovery
            ? "Enter one of your recovery codes."
            : "Enter the 6-digit code from your authenticator app."}
          {expiresLabel ? ` ${expiresLabel}.` : null}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-3">
          <Input
            inputMode={useRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            value={value}
            onChange={(e) =>
              setValue(
                useRecovery
                  ? e.target.value
                  : e.target.value.replace(/\D+/g, "").slice(0, 6),
              )
            }
            placeholder={useRecovery ? "abcde-fghij" : "123456"}
            data-testid="mfa-challenge-input"
          />
          <button
            type="button"
            className="text-sm underline text-muted-foreground"
            onClick={() => {
              setUseRecovery((p) => !p);
              setValue("");
              setError(null);
            }}
            data-testid="mfa-challenge-toggle-recovery"
          >
            {useRecovery
              ? "Use authenticator app instead"
              : "Use a recovery code instead"}
          </button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={submitting || value.length === 0}
            data-testid="mfa-challenge-submit"
          >
            {submitting ? "Verifying…" : "Verify"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default MfaChallengeForm;
