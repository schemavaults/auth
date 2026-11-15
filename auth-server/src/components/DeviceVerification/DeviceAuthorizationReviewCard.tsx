"use client";

import { useState, type ReactElement } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@schemavaults/ui";
import { FlowExpiryCountdown } from "@schemavaults/auth-ui";
import { Loader2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { ConsentPermissions } from "@/components/AppAuthorizationConsentScreen";
import { useAuthServerFriendlyName } from "@/components/Wordmark";
import { DEVICE_VERIFICATION_CARD_CLASS_NAME } from "./card-class-name";
import type { DeviceAuthorizationDetails } from "./device-verification-api";

export interface DeviceAuthorizationReviewCardProps {
  details: DeviceAuthorizationDetails;
  /** Which button is busy, if any. */
  pending: "approve" | "deny" | null;
  expired: boolean;
  onExpired: () => void;
  onApprove: (approved_api_scopes: readonly string[]) => void;
  onDeny: () => void;
  /** Go back to code entry (wrong code, or a fresh one after expiry). */
  onEnterAnotherCode: () => void;
}

/**
 * Step 2 of `/device`: what the device asks for. The user code is shown big
 * so the user compares it with their device (RFC 8628 §5.4: a code someone
 * else sent them is a phishing attempt), with the app (its name and
 * description are unverified), the permissions in the consent screen's
 * words, and a countdown to the code's expiry.
 */
export function DeviceAuthorizationReviewCard({
  details,
  pending,
  expired,
  onExpired,
  onApprove,
  onDeny,
  onEnterAnotherCode,
}: DeviceAuthorizationReviewCardProps): ReactElement {
  const friendly_name: string = useAuthServerFriendlyName();
  const pending_api_scopes = details.consent.pending_api_scopes;
  const [approved, setApproved] = useState<ReadonlySet<string>>(
    () => new Set(pending_api_scopes.map((s) => s.scope)),
  );
  const busy: boolean = pending !== null;
  const { app_name, app_description } = details.client_app;

  return (
    <Card className={DEVICE_VERIFICATION_CARD_CLASS_NAME} data-testid="device-authorization-review">
      <CardHeader>
        <CardTitle>Sign in on a device?</CardTitle>
        <CardDescription className="break-words">
          <strong data-testid="device-app-name">{app_name}</strong> on a device wants to access your{" "}
          {friendly_name} account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="rounded-md border p-3 bg-muted/50 flex flex-col items-center gap-1">
          <p className="text-sm font-medium">Check that your device shows this code:</p>
          <p
            className="text-2xl font-mono font-semibold tracking-widest"
            data-testid="device-user-code"
          >
            {details.user_code}
          </p>
        </div>
        <FlowExpiryCountdown
          expires_at={details.expires_at}
          duration_ms={details.expires_at - details.created_at}
          subject="This code"
          onExpired={onExpired}
        />
        {app_description.length > 0 ? (
          <p className="text-sm text-muted-foreground break-words" data-testid="device-app-description">
            {app_description}
          </p>
        ) : null}
        <ConsentPermissions
          consent={details.consent}
          approved={approved}
          onApprovedChange={setApproved}
          disabled={busy || expired}
        />
        <div className="flex flex-row gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Only continue if you started signing in on this device yourself. If someone sent you
            this code, deny the request: approving would give them access to your account.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          The application name and description are provided by its developers and are not
          verified by {friendly_name}.
        </p>
      </CardContent>
      <CardFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center sm:gap-4">
        {expired ? (
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={onEnterAnotherCode}
            data-testid="device-enter-another-code"
          >
            Enter another code
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={onDeny}
            disabled={busy}
            data-testid="device-deny-button"
          >
            {pending === "deny" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" role="status" />
            ) : (
              <X className="h-4 w-4 mr-2" />
            )}
            Deny
          </Button>
        )}
        <Button
          className="w-full sm:w-auto bg-green-500 hover:bg-green-400 text-white font-semibold"
          onClick={() =>
            onApprove(pending_api_scopes.map((s) => s.scope).filter((scope) => approved.has(scope)))
          }
          disabled={busy || expired}
          data-testid="device-approve-button"
        >
          {pending === "approve" ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" role="status" />
          ) : (
            <ShieldCheck className="h-4 w-4 mr-2" />
          )}
          Approve
        </Button>
      </CardFooter>
    </Card>
  );
}

export default DeviceAuthorizationReviewCard;
