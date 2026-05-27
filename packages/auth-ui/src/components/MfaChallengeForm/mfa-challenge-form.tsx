"use client";

import {
  useEffect,
  useState,
  type FC,
  type FormEvent,
  type ReactElement,
} from "react";
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
  onAuthenticated: (authorization_code: string) => Promise<void> | void;
  onChallengeExpired?: () => void;
}

interface FactorsState {
  loading: boolean;
  factors: AvailableMfaFactor[];
  recovery_codes_available: boolean;
  error: string | null;
}

export const MfaChallengeForm: FC<MfaChallengeFormProps> = ({
  challenge_id,
  client_app_id,
  expires_at,
  onAuthenticated,
  onChallengeExpired,
}): ReactElement => {
  const { submitChallenge, getChallengeFactors } = useMfa();
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [selectedFactorId, setSelectedFactorId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [factorsState, setFactorsState] = useState<FactorsState>({
    loading: true,
    factors: [],
    recovery_codes_available: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getChallengeFactors(challenge_id, client_app_id);
        if (cancelled) return;
        setFactorsState({
          loading: false,
          factors: result.available_factors,
          recovery_codes_available: result.recovery_codes_available,
          error: null,
        });
        // Default to the most-recently-used factor (server returns the
        // list pre-sorted by last_used_at DESC).
        if (result.available_factors[0]) {
          setSelectedFactorId(result.available_factors[0].factor_id);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        // The SDK signals expired/exhausted challenges by throwing an
        // Error with `name === "MfaChallengeExpiredError"`. Matching on
        // the name avoids depending on `@schemavaults/auth-client-sdk`
        // here just to import the error class.
        const isExpired =
          e instanceof Error && e.name === "MfaChallengeExpiredError";
        const message =
          e instanceof Error ? e.message : "Failed to load MFA factors";
        setFactorsState({
          loading: false,
          factors: [],
          recovery_codes_available: false,
          error: message,
        });
        if (isExpired && onChallengeExpired) {
          onChallengeExpired();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [challenge_id, client_app_id, getChallengeFactors, onChallengeExpired]);

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

  const showFactorPicker =
    !useRecovery && factorsState.factors.length > 1;

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
          {factorsState.loading ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="mfa-challenge-loading"
            >
              Loading verification options…
            </p>
          ) : factorsState.error ? (
            <p className="text-sm text-destructive">{factorsState.error}</p>
          ) : (
            <>
              {showFactorPicker ? (
                <MfaFactorPicker
                  factors={factorsState.factors}
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
              {factorsState.recovery_codes_available ? (
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
            </>
          )}
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
