"use client";

import { useState, type ReactElement } from "react";
import { Button } from "@schemavaults/ui";
import { useWebauthnCredentialsSwr } from "@schemavaults/auth-react-provider";
import { Fingerprint, KeyRound, Plus, Trash2 } from "lucide-react";
import { PasskeyEnrollmentDialog } from "./PasskeyEnrollmentDialog";
import { PasskeyRemoveDialog } from "./PasskeyRemoveDialog";

// Passkey management section rendered inside @schemavaults/auth-ui's
// MfaSettingsCard via its `passkeysSection` slot. Lists the user's enrolled
// passkeys and hosts the enroll/remove dialogs. All WebAuthn browser
// ceremonies stay in the auth server (here), not in the shared auth-ui
// package.
export function PasskeysSettingsSection(): ReactElement {
  const { data: credentials, isLoading } = useWebauthnCredentialsSwr();
  const [enrolling, setEnrolling] = useState(false);
  const [removingFactorId, setRemovingFactorId] = useState<string | null>(null);

  const passkeys = credentials ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          Passkeys
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEnrolling(true)}
          data-testid="passkey-add-button"
          className="flex flex-row gap-2 flex-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add a passkey
        </Button>
      </div>

      {isLoading && !credentials ? (
        <p className="text-sm text-muted-foreground">Loading passkeys…</p>
      ) : passkeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No passkeys enrolled. Add one to sign in with device biometrics or a
          security key.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="passkey-list">
          {passkeys.map((p) => (
            <li
              key={p.factor_id}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">
                    {p.label ?? "Passkey"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Added {new Date(p.created_at).toLocaleDateString()}
                    {p.last_used_at
                      ? ` · Last used ${new Date(p.last_used_at).toLocaleDateString()}`
                      : " · Never used"}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRemovingFactorId(p.factor_id)}
                data-testid={`passkey-remove-${p.factor_id}`}
                className="flex flex-row gap-2 flex-nowrap text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {enrolling && (
        <PasskeyEnrollmentDialog
          open={enrolling}
          onClose={() => setEnrolling(false)}
        />
      )}
      {removingFactorId && (
        <PasskeyRemoveDialog
          open={!!removingFactorId}
          factor_id={removingFactorId}
          onClose={() => setRemovingFactorId(null)}
        />
      )}
    </div>
  );
}

export default PasskeysSettingsSection;
