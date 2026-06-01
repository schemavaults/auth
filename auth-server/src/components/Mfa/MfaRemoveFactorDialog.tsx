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
import { Trash2, X } from "lucide-react";

export interface MfaRemoveFactorDialogProps {
  open: boolean;
  factor_id: string;
  onClose: () => void;
}

export const MfaRemoveFactorDialog: FC<MfaRemoveFactorDialogProps> = ({
  open,
  factor_id,
  onClose,
}): ReactElement => {
  const { removeFactor } = useMfa();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await removeFactor(factor_id, code);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove factor");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove authenticator</DialogTitle>
          <DialogDescription>
            Enter your current 6-digit authenticator code to confirm.
            Removing the authenticator also invalidates your recovery
            codes.
          </DialogDescription>
        </DialogHeader>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D+/g, ""))}
          placeholder="123456"
          data-testid="mfa-remove-factor-code"
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
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting || code.length !== 6}
            data-testid="mfa-remove-factor-confirm"
            className="flex flex-row gap-2 flex-nowrap"
          >
            <Trash2 className="h-4 w-4" />
            {submitting ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MfaRemoveFactorDialog;
