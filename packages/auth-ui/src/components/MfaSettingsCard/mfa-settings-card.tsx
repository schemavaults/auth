"use client";

import { useState, type FC, type ReactElement } from "react";
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
import { useMfa } from "@schemavaults/auth-react-provider";
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
}

export const MfaSettingsCard: FC<MfaSettingsCardProps> = ({
  className,
}): ReactElement => {
  const { status, isLoading } = useMfa();
  const [enrolling, setEnrolling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const enabled = !!status?.enabled;
  // The settings card is single-factor today; surface the first enrolled
  // factor for the "enabled on" timestamp and the remove dialog.
  const primaryFactor = status?.factors?.[0];
  const factorTypesLabel = status?.factors
    .map((factor) => factor.factor_type.toUpperCase())
    .join(", ");

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
              <strong>Status:</strong> Enabled
              {factorTypesLabel ? ` (${factorTypesLabel})` : ""}
            </div>
            {typeof status?.recovery_codes_remaining === "number" && (
              <div>
                <strong>Recovery codes remaining:</strong>{" "}
                {status.recovery_codes_remaining}
              </div>
            )}
            {typeof primaryFactor?.verified_at === "number" && (
              <div className="text-muted-foreground">
                Enabled on{" "}
                {new Date(primaryFactor.verified_at).toLocaleString()}
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
      {enrolling && (
        <TotpEnrollmentDialog
          open={enrolling}
          onClose={() => setEnrolling(false)}
        />
      )}
      {removing && primaryFactor?.factor_id && (
        <MfaRemoveFactorDialog
          open={removing}
          factor_id={primaryFactor.factor_id}
          onClose={() => setRemoving(false)}
        />
      )}
      {regenerating && (
        <MfaRegenerateRecoveryCodesDialog
          open={regenerating}
          onClose={() => setRegenerating(false)}
        />
      )}
    </Card>
  );
};

export default MfaSettingsCard;
