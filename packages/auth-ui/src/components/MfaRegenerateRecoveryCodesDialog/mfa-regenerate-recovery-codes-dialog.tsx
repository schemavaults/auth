"use client";

import { useState, type FC, type ReactElement } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@schemavaults/ui";
import { useMfa } from "@schemavaults/auth-react-provider";
import { Check, RefreshCw, X } from "lucide-react";
import { RecoveryCodesPanel } from "../RecoveryCodesPanel";

export interface MfaRegenerateRecoveryCodesDialogProps {
  open: boolean;
  onClose: () => void;
}

export const MfaRegenerateRecoveryCodesDialog: FC<
  MfaRegenerateRecoveryCodesDialogProps
> = ({ open, onClose }): ReactElement => {
  const { regenerateRecoveryCodes } = useMfa();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await regenerateRecoveryCodes(code);
      setNewCodes(res.recovery_codes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to regenerate codes");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate recovery codes</DialogTitle>
          <DialogDescription>
            {newCodes
              ? "Save the new codes. The previous set is no longer valid."
              : "Enter your current 6-digit authenticator code to generate a new set of recovery codes. This invalidates all previous codes."}
          </DialogDescription>
        </DialogHeader>
        {newCodes ? (
          <RecoveryCodesPanel
            codes={newCodes}
            onAcknowledge={setAcknowledged}
          />
        ) : (
          <>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D+/g, ""))}
              placeholder="123456"
              data-testid="mfa-regenerate-code-input"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
        <DialogFooter>
          {newCodes ? (
            <Button
              onClick={onClose}
              disabled={!acknowledged}
              data-testid="mfa-regenerate-done"
              className="flex flex-row gap-2 flex-nowrap"
            >
              <Check className="h-4 w-4" />
              Done
            </Button>
          ) : (
            <>
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
                data-testid="mfa-regenerate-confirm"
                className="flex flex-row gap-2 flex-nowrap"
              >
                <RefreshCw className="h-4 w-4" />
                {submitting ? "Generating…" : "Generate new codes"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MfaRegenerateRecoveryCodesDialog;
