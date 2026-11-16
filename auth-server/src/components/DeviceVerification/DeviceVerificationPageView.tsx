"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { normalizeUserCode } from "@schemavaults/auth-common";
import { ThemedPageBackground } from "@/components/ThemedPageBackground";
import {
  approveDeviceAuthorization,
  denyDeviceAuthorization,
  lookupDeviceAuthorization,
  type DeviceAuthorizationDetails,
  type DeviceVerificationFailure,
} from "./device-verification-api";
import { UserCodeEntryCard } from "./UserCodeEntryCard";
import { DeviceAuthorizationReviewCard } from "./DeviceAuthorizationReviewCard";
import {
  DeviceVerificationOutcomeCard,
  type DeviceVerificationOutcome,
} from "./DeviceVerificationOutcomeCard";

export interface DeviceVerificationPageViewProps {
  /**
   * The code from `verification_uri_complete` (`/device?user_code=…`),
   * normalized; null when the user opened the bare `verification_uri`.
   */
  initial_user_code: string | null;
}

type Step =
  | { kind: "enter"; error: string | null }
  | { kind: "review"; details: DeviceAuthorizationDetails; expired: boolean }
  | { kind: "outcome"; outcome: DeviceVerificationOutcome };

/**
 * The `/device` page (RFC 8628 `verification_uri`): enter the code the device
 * shows (prefilled from `verification_uri_complete`), review what the device
 * asks for, then approve or deny. The user is signed in already (the page's
 * route guard sends signed-out visitors through the login page and back).
 */
export function DeviceVerificationPageView({
  initial_user_code,
}: DeviceVerificationPageViewProps): ReactElement {
  const [code, setCode] = useState<string>(initial_user_code ?? "");
  const [step, setStep] = useState<Step>({ kind: "enter", error: null });
  const [busy, setBusy] = useState<"lookup" | "approve" | "deny" | null>(null);
  const autoLookupDone = useRef<boolean>(false);

  function messageFor(failure: DeviceVerificationFailure): string {
    return failure.message;
  }

  async function lookup(raw_code: string): Promise<void> {
    const normalized: string | null = normalizeUserCode(raw_code);
    if (normalized === null) {
      setStep({ kind: "enter", error: "Enter all 8 characters of the code shown on your device." });
      return;
    }
    setBusy("lookup");
    const result = await lookupDeviceAuthorization(normalized);
    setBusy(null);
    if (result.ok) {
      setStep({ kind: "review", details: result.value, expired: false });
      return;
    }
    if (result.failure.kind === "email_verification_required") {
      setStep({ kind: "outcome", outcome: { kind: "email_verification_required", message: result.failure.message } });
      return;
    }
    if (result.failure.kind === "signed_out") {
      window.location.reload();
      return;
    }
    setStep({ kind: "enter", error: messageFor(result.failure) });
  }

  // A link or QR code (`verification_uri_complete`) carries the code: look it
  // up at once, so the user only has to compare it with their device.
  useEffect(() => {
    if (initial_user_code !== null && !autoLookupDone.current) {
      autoLookupDone.current = true;
      void lookup(initial_user_code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  async function decide(details: DeviceAuthorizationDetails, decision: "approve" | "deny", approved_api_scopes: readonly string[] = []): Promise<void> {
    setBusy(decision);
    const result =
      decision === "approve"
        ? await approveDeviceAuthorization(details.user_code, approved_api_scopes)
        : await denyDeviceAuthorization(details.user_code);
    setBusy(null);
    const app_name: string = details.client_app.app_name;
    if (result.ok) {
      setStep({ kind: "outcome", outcome: { kind: decision === "approve" ? "approved" : "denied", app_name } });
      return;
    }
    if (result.failure.kind === "email_verification_required") {
      setStep({ kind: "outcome", outcome: { kind: "email_verification_required", message: result.failure.message } });
      return;
    }
    if (result.failure.kind === "signed_out") {
      window.location.reload();
      return;
    }
    setStep({ kind: "enter", error: messageFor(result.failure) });
  }

  function restart(): void {
    setCode("");
    setStep({ kind: "enter", error: null });
  }

  return (
    <ThemedPageBackground
      className="items-center justify-center flex"
      backgroundClassName="grow min-h-[100dvh] h-full no-scrollbar"
    >
      {step.kind === "enter" ? (
        <UserCodeEntryCard
          code={code}
          onCodeChange={(next) => {
            setCode(next);
            if (step.error !== null) setStep({ kind: "enter", error: null });
          }}
          onSubmit={(value) => void lookup(value)}
          submitting={busy === "lookup"}
          error={step.error}
        />
      ) : step.kind === "review" ? (
        <DeviceAuthorizationReviewCard
          details={step.details}
          pending={busy === "approve" || busy === "deny" ? busy : null}
          expired={step.expired}
          onExpired={() => setStep({ ...step, expired: true })}
          onApprove={(scopes) => void decide(step.details, "approve", scopes)}
          onDeny={() => void decide(step.details, "deny")}
          onEnterAnotherCode={restart}
        />
      ) : (
        <DeviceVerificationOutcomeCard outcome={step.outcome} onEnterAnotherCode={restart} />
      )}
    </ThemedPageBackground>
  );
}

export default DeviceVerificationPageView;
