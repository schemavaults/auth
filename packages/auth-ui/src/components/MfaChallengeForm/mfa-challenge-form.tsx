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
import type {
  AuthenticateResult,
  AvailableMfaFactor,
} from "@schemavaults/auth-common";
import { ShieldCheck } from "lucide-react";
import { MfaFactorPicker } from "@/components/MfaFactorPicker";

export interface MfaChallengeFormProps {
  challenge_id: string;
  client_app_id: string;
  expires_at?: number;
  // Factor list and recovery-code availability for this challenge. The
  // login form stashes these from the `mfa_required` response into
  // sessionStorage; the page that renders this form reads them back out
  // and passes them in. Required props because the picker needs them to
  // render — there is no in-form fallback fetch.
  available_factors: AvailableMfaFactor[];
  recovery_codes_available: boolean;
  onAuthenticated: (authorization_code: string) => Promise<void> | void;
  onChallengeExpired?: () => void;
}

export const MfaChallengeForm: FC<MfaChallengeFormProps> = ({
  challenge_id,
  client_app_id,
  expires_at,
  available_factors,
  recovery_codes_available,
  onAuthenticated,
  onChallengeExpired,
}): ReactElement => {
  const { submitChallenge } = useMfa();
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [selectedFactorId, setSelectedFactorId] = useState<string>(
    // Default to the most-recently-used factor — the login response sorts
    // available_factors by last_used_at DESC NULLS LAST.
    available_factors[0]?.factor_id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const proof = useRecovery
        ? ({ type: "recovery_code" as const, recovery_code: value })
        : ({
            type: "totp" as const,
            factor_id: selectedFactorId,
            code: value,
          });
      const result: AuthenticateResult = await submitChallenge(
        challenge_id,
        client_app_id,
        proof,
      );
      if (result.kind === "authenticated") {
        await onAuthenticated(result.authorization_code);
        return;
      }
      if (result.kind === "challenge_expired") {
        setError(
          result.message ||
            "Too many attempts. Please log in again to start a new challenge.",
        );
        if (onChallengeExpired) onChallengeExpired();
        return;
      }
      if (result.kind === "failure") {
        setError(result.message || "Verification failed");
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

  const showFactorPicker = !useRecovery && available_factors.length > 1;

  const canSubmit =
    !submitting &&
    value.length > 0 &&
    (useRecovery || selectedFactorId.length > 0);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Verify it&apos;s you</CardTitle>
        <CardDescription>
          {useRecovery
            ? "Enter one of your recovery codes."
            : "Enter the 6-digit code from your authenticator app."}
          {expiresLabel ? (
            <span suppressHydrationWarning>{` ${expiresLabel}.`}</span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-3">
          {showFactorPicker ? (
            <MfaFactorPicker
              factors={available_factors}
              selected_factor_id={selectedFactorId}
              onSelect={(id) => {
                setSelectedFactorId(id);
                setValue("");
                setError(null);
              }}
              disabled={submitting}
            />
          ) : null}
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
          {recovery_codes_available ? (
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
          ) : null}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={!canSubmit}
            data-testid="mfa-challenge-submit"
            className="flex flex-row gap-2 flex-nowrap"
          >
            <ShieldCheck className="h-4 w-4" />
            {submitting ? "Verifying…" : "Verify"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default MfaChallengeForm;
