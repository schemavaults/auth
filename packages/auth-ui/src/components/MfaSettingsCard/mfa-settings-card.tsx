"use client";

import { useState, type FC, type ReactElement, type ReactNode } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
} from "@schemavaults/ui";
import {
  useMfa,
  useMfaFactorStatusSwr,
} from "@schemavaults/auth-react-provider";
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  ShieldOff,
  Smartphone,
} from "lucide-react";
import { TotpEnrollmentDialog } from "../TotpEnrollmentDialog";
import { MfaRemoveFactorDialog } from "../MfaRemoveFactorDialog";
import { MfaRegenerateRecoveryCodesDialog } from "../MfaRegenerateRecoveryCodesDialog";

export interface MfaSettingsCardProps {
  className?: string;
  // Optional passkey (WebAuthn) management UI rendered as its own section
  // below the authenticator-app controls. Supplied by the auth server, which
  // owns the passkey browser ceremonies; this package stays free of any
  // WebAuthn browser dependency for its external consumers.
  passkeysSection?: ReactNode;
}

export const MfaSettingsCard: FC<MfaSettingsCardProps> = ({
  className,
  passkeysSection,
}): ReactElement => {
  // The settings card only manages the TOTP factor, so query that factor
  // type explicitly rather than picking an arbitrary entry out of the
  // account-wide factor list (there is no "primary" factor — all are
  // equivalent). Recovery codes are account-wide, so that count still
  // comes from the aggregate status.
  const { status, isLoading: aggregateLoading } = useMfa();
  const { data: totpStatus, isLoading: totpLoading } =
    useMfaFactorStatusSwr("totp");
  const [enrolling, setEnrolling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const isLoading = aggregateLoading || totpLoading;
  const enabled = !!totpStatus?.enabled;

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {enabled ? (
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          )}
          Multi-Factor Authentication
        </CardTitle>
        <CardDescription>
          {enabled
            ? "An authenticator app is required at sign-in."
            : "Add a second factor to protect your account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading status…</p>
        ) : enabled ? (
          <div className="space-y-2 text-sm">
            <div>
              <strong>Status:</strong> Enabled (TOTP)
            </div>
            {typeof status?.recovery_codes_remaining === "number" && (
              <div>
                <strong>Recovery codes remaining:</strong>{" "}
                {status.recovery_codes_remaining}
              </div>
            )}
            {typeof totpStatus?.verified_at === "number" && (
              <div className="text-muted-foreground">
                Enabled on{" "}
                {new Date(totpStatus.verified_at).toLocaleString()}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            MFA is not currently enabled on your account.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {enabled ? (
          <>
            <Button
              variant="outline"
              onClick={() => setRegenerating(true)}
              disabled={regenerating}
              className="flex flex-row gap-2 flex-nowrap"
            >
              <KeyRound className="h-4 w-4" />
              Regenerate recovery codes
            </Button>
            <Button
              variant="destructive"
              onClick={() => setRemoving(true)}
              disabled={removing}
              className="flex flex-row gap-2 flex-nowrap"
            >
              <ShieldOff className="h-4 w-4" />
              Remove authenticator
            </Button>
          </>
        ) : (
          <Button
            onClick={() => setEnrolling(true)}
            disabled={enrolling}
            className="flex flex-row gap-2 flex-nowrap"
          >
            <Smartphone className="h-4 w-4" />
            Set up authenticator app
          </Button>
        )}
      </CardFooter>
      {passkeysSection ? (
        <div className="border-t px-6 py-4">{passkeysSection}</div>
      ) : null}
      {enrolling && (
        <TotpEnrollmentDialog
          open={enrolling}
          onClose={() => setEnrolling(false)}
        />
      )}
      {removing && totpStatus?.factor_id && (
        <MfaRemoveFactorDialog
          open={removing}
          factor_id={totpStatus.factor_id}
          onClose={() => setRemoving(false)}
        />
      )}
      {regenerating && totpStatus?.factor_id && (
        <MfaRegenerateRecoveryCodesDialog
          open={regenerating}
          factor_id={totpStatus.factor_id}
          onClose={() => setRegenerating(false)}
        />
      )}
    </Card>
  );
};

export default MfaSettingsCard;
