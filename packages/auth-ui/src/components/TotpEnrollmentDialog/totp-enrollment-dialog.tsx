"use client";

import { useEffect, useState, type FC, type ReactElement } from "react";
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
import type { MfaEnrollResponse } from "@schemavaults/auth-common";
import { useMfa } from "@schemavaults/auth-react-provider";
import { Check, ShieldCheck, X } from "lucide-react";
import { RecoveryCodesPanel } from "../RecoveryCodesPanel";

export interface TotpEnrollmentDialogProps {
  open: boolean;
  onClose: () => void;
}

type Step = "loading" | "scan" | "recovery" | "error";

export const TotpEnrollmentDialog: FC<TotpEnrollmentDialogProps> = ({
  open,
  onClose,
}): ReactElement => {
  const { enrollTotp, confirmTotpEnrollment } = useMfa();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("loading");
  const [enrollment, setEnrollment] = useState<MfaEnrollResponse | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (open && step === "loading") {
      void enrollTotp()
        .then((res) => {
          if (cancelled) return;
          setEnrollment(res);
          setStep("scan");
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setError(
            e instanceof Error ? e.message : "Failed to start enrollment",
          );
          setStep("error");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, step, enrollTotp]);

  const handleConfirm = async () => {
    if (!enrollment) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await confirmTotpEnrollment(enrollment.factor_id, code);
      setRecoveryCodes(result.recovery_codes);
      setStep("recovery");
      toast({
        variant: "default",
        title: "Multi-factor authentication enabled",
        description:
          "Your authenticator app is now required at sign-in. Save the recovery codes before closing this dialog.",
      });
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to confirm authenticator code",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up an authenticator app</DialogTitle>
          <DialogDescription>
            Scan the QR code with your authenticator app, then enter the 6-digit
            code it generates.
          </DialogDescription>
        </DialogHeader>
        {step === "loading" && (
          <p className="text-sm text-muted-foreground">Starting enrollment…</p>
        )}
        {step === "error" && (
          <p className="text-sm text-destructive">{error ?? "Unknown error"}</p>
        )}
        {step === "scan" && enrollment && (
          <div className="space-y-3">
            <img
              src={enrollment.qr_code_data_url}
              alt="TOTP QR code"
              className="mx-auto h-56 w-56"
              data-testid="mfa-enroll-qr"
            />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                Can&apos;t scan? Show secret
              </summary>
              <code className="mt-1 block break-all rounded bg-muted p-2 font-mono">
                {enrollment.secret}
              </code>
            </details>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D+/g, ""))}
              placeholder="123456"
              data-testid="mfa-enroll-code-input"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={onClose}
                disabled={submitting}
                className="flex flex-row gap-2 flex-nowrap"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={submitting || code.length !== 6}
                data-testid="mfa-enroll-confirm"
                className="flex flex-row gap-2 flex-nowrap"
              >
                <ShieldCheck className="h-4 w-4" />
                {submitting ? "Verifying…" : "Verify code"}
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
                data-testid="mfa-enroll-done"
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
};

export default TotpEnrollmentDialog;
