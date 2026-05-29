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
import {
  useMfa,
  useMfaFactorStatusSwr,
} from "@schemavaults/auth-react-provider";
import {
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { Fingerprint, ShieldOff, X } from "lucide-react";
import type {
  MfaProof,
  WebauthnAuthenticationResponse,
} from "@schemavaults/auth-common";

export interface PasskeyRemoveDialogProps {
  open: boolean;
  // The passkey factor to remove.
  factor_id: string;
  onClose: () => void;
}

type Mode = "totp" | "recovery";

// Removing a passkey requires step-up proof of a current factor. The user can
// re-assert with a passkey, or (if they have one) enter a TOTP code, or a
// recovery code.
export function PasskeyRemoveDialog({
  open,
  factor_id,
  onClose,
}: PasskeyRemoveDialogProps): ReactElement {
  const { getWebauthnStepUpOptions, removeWebauthnFactor } = useMfa();
  const { data: totpStatus } = useMfaFactorStatusSwr("totp");
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("totp");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasTotp = !!totpStatus?.enabled;
  const totpFactorId = totpStatus?.factor_id ?? null;
  const supportsPasskey =
    typeof window !== "undefined" && browserSupportsWebAuthn();
  // Fall back to recovery codes when the user has no authenticator app.
  const activeMode: Mode = hasTotp ? mode : "recovery";

  const finish = async (proof: MfaProof): Promise<void> => {
    await removeWebauthnFactor(factor_id, proof);
    toast({
      variant: "default",
      title: "Passkey removed",
      description: "The passkey can no longer be used to sign in.",
    });
    onClose();
  };

  const handlePasskey = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { options } = await getWebauthnStepUpOptions();
      const assertion = await startAuthentication({
        optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
      });
      await finish({
        type: "webauthn",
        factor_id,
        assertion: assertion as unknown as WebauthnAuthenticationResponse,
      });
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Passkey verification failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCodeSubmit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (activeMode === "totp") {
        if (!totpFactorId) {
          setError("No authenticator app is configured.");
          return;
        }
        await finish({ type: "totp", factor_id: totpFactorId, code: value });
      } else {
        await finish({ type: "recovery_code", recovery_code: value });
      }
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Verification failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this passkey</DialogTitle>
          <DialogDescription>
            Confirm it&apos;s you before removing this passkey.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {supportsPasskey ? (
            <Button
              type="button"
              onClick={() => void handlePasskey()}
              disabled={busy}
              data-testid="passkey-remove-with-passkey"
              className="flex w-full flex-row gap-2 flex-nowrap"
            >
              <Fingerprint className="h-4 w-4" />
              {busy ? "Waiting for passkey…" : "Verify with a passkey & remove"}
            </Button>
          ) : null}

          <div className="space-y-2">
            <div className="flex gap-3 text-sm">
              {hasTotp ? (
                <button
                  type="button"
                  className={
                    activeMode === "totp"
                      ? "font-medium underline"
                      : "text-muted-foreground"
                  }
                  onClick={() => {
                    setMode("totp");
                    setValue("");
                    setError(null);
                  }}
                >
                  Authenticator code
                </button>
              ) : null}
              <button
                type="button"
                className={
                  activeMode === "recovery"
                    ? "font-medium underline"
                    : "text-muted-foreground"
                }
                onClick={() => {
                  setMode("recovery");
                  setValue("");
                  setError(null);
                }}
              >
                Recovery code
              </button>
            </div>
            <Input
              inputMode={activeMode === "totp" ? "numeric" : "text"}
              autoComplete="one-time-code"
              value={value}
              onChange={(e) =>
                setValue(
                  activeMode === "totp"
                    ? e.target.value.replace(/\D+/g, "").slice(0, 6)
                    : e.target.value,
                )
              }
              placeholder={activeMode === "totp" ? "123456" : "abcde-fghij"}
              data-testid="passkey-remove-code-input"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            className="flex flex-row gap-2 flex-nowrap"
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleCodeSubmit()}
            disabled={busy || value.length === 0}
            data-testid="passkey-remove-confirm"
            className="flex flex-row gap-2 flex-nowrap"
          >
            <ShieldOff className="h-4 w-4" />
            Remove passkey
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PasskeyRemoveDialog;
