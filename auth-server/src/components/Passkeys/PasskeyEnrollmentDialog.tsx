"use client";

import { useState, type ReactElement } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  useToast,
} from "@schemavaults/ui";
import { RecoveryCodesPanel } from "@/components/RecoveryCodesPanel";
import { useMfa } from "@schemavaults/auth-react-provider";
import {
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { Check, Fingerprint, Repeat2, X } from "lucide-react";
import type { WebauthnRegistrationResponse } from "@schemavaults/auth-common";

export interface PasskeyEnrollmentDialogProps {
  open: boolean;
  onClose: () => void;
}

type Step = "intro" | "creating" | "recovery" | "done" | "error";

// Runs the browser WebAuthn registration ceremony to enroll a passkey as an
// MFA factor. Recovery codes are shown only when this is the user's first
// verified factor (server returns recovery_codes_issued).
export function PasskeyEnrollmentDialog({
  open,
  onClose,
}: PasskeyEnrollmentDialogProps): ReactElement {
  const { beginWebauthnEnrollment, confirmWebauthnEnrollment } = useMfa();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("intro");
  const [label, setLabel] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const supported =
    typeof window !== "undefined" && browserSupportsWebAuthn();

  const handleCreate = async (): Promise<void> => {
    setStep("creating");
    setError(null);
    try {
      const { factor_id, options } = await beginWebauthnEnrollment();
      const attestation = await startRegistration({
        optionsJSON:
          options as unknown as PublicKeyCredentialCreationOptionsJSON,
      });
      const result = await confirmWebauthnEnrollment(
        factor_id,
        attestation as unknown as WebauthnRegistrationResponse,
        label.trim() ? label.trim() : undefined,
      );
      toast({
        variant: "default",
        title: "Passkey added",
        description: result.recovery_codes_issued
          ? "Your passkey is now a sign-in factor. Save the recovery codes before closing."
          : "Your passkey is now a sign-in factor.",
      });
      if (result.recovery_codes_issued) {
        setRecoveryCodes(result.recovery_codes);
        setStep("recovery");
      } else {
        setStep("done");
      }
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Passkey creation was cancelled or failed.",
      );
      setStep("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a passkey</DialogTitle>
          <DialogDescription>
            Use your device biometrics, screen lock, or a security key as a
            second factor at sign-in.
          </DialogDescription>
        </DialogHeader>

        {step === "intro" && (
          <div className="space-y-3">
            {!supported ? (
              <p className="text-sm text-destructive">
                This browser does not support passkeys.
              </p>
            ) : (
              <>
                <label className="text-sm font-medium" htmlFor="passkey-label">
                  Nickname (optional)
                </label>
                <Input
                  id="passkey-label"
                  value={label}
                  maxLength={64}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. MacBook Touch ID"
                  data-testid="passkey-enroll-label-input"
                />
              </>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={onClose}
                className="flex flex-row gap-2 flex-nowrap"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreate()}
                disabled={!supported}
                data-testid="passkey-enroll-create"
                className="flex flex-row gap-2 flex-nowrap"
              >
                <Fingerprint className="h-4 w-4" />
                Create passkey
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "creating" && (
          <p className="text-sm text-muted-foreground">
            Follow your browser&apos;s prompt to create the passkey…
          </p>
        )}

        {step === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              {error ?? "Unknown error"}
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={onClose}
                className="flex flex-row gap-2 flex-nowrap"
              >
                <X className="h-4 w-4" />
                Close
              </Button>
              <Button
                onClick={() => setStep("intro")}
                className="flex flex-row gap-2 flex-nowrap items-center justify-start"
              >
                <Repeat2 className="h-4 w-4" />
                Try again
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "recovery" && (
          <div className="space-y-3">
            <RecoveryCodesPanel
              codes={recoveryCodes}
              onAcknowledge={setAcknowledged}
            />
            <DialogFooter>
              <Button
                onClick={onClose}
                disabled={!acknowledged}
                data-testid="passkey-enroll-done"
                className="flex flex-row gap-2 flex-nowrap"
              >
                <Check className="h-4 w-4" />
                Done
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3">
            <p
              className="text-sm text-muted-foreground"
              data-testid="passkey-enroll-existing-recovery-note"
            >
              Your passkey has been added. Your existing recovery codes still
              apply — no new codes were generated.
            </p>
            <DialogFooter>
              <Button
                onClick={onClose}
                data-testid="passkey-enroll-done"
                className="flex flex-row gap-2 flex-nowrap"
              >
                <Check className="h-4 w-4" />
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PasskeyEnrollmentDialog;
