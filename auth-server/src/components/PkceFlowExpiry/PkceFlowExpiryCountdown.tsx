"use client";

import { useMemo, type ReactElement } from "react";
import { useSearchParams } from "next/navigation";
import { FlowExpiryCountdown } from "@schemavaults/auth-ui";
import { PKCE_FLOW_DURATION_MS, pkceFlowExpiresAt } from "./pkce-flow-expires-at";

export interface PkceFlowExpiryCountdownProps {
  /** The requesting app's name, for the expired message. */
  app_name?: string | null;
  /** Called once the request expires (disable whatever would submit it). */
  onExpired?: () => void;
  className?: string;
}

/**
 * The countdown of a third-party sign-in request: how long the user has to
 * finish signing in (and consenting) before the PKCE challenge the app sent
 * expires and the app has to start over. Reads the flow's `challenge_time`
 * from the URL and renders nothing without one (the auth server's own
 * account sign-in, which never expires).
 */
export function PkceFlowExpiryCountdown({
  app_name,
  onExpired,
  className,
}: PkceFlowExpiryCountdownProps): ReactElement | null {
  const searchParams = useSearchParams();
  const challenge_time: string | null = searchParams.get("challenge_time");
  // Read once per challenge_time: the clock-skew check must not flip later.
  const expires_at: number | null = useMemo(
    () => pkceFlowExpiresAt(challenge_time),
    [challenge_time],
  );
  if (expires_at === null) {
    return null;
  }
  const requester: string = app_name && app_name.length > 0 ? app_name : "the app you came from";
  return (
    <FlowExpiryCountdown
      expires_at={expires_at}
      duration_ms={PKCE_FLOW_DURATION_MS}
      subject="This sign-in request"
      size="sm"
      onExpired={onExpired}
      className={className}
      expiredContent={
        <p
          className="text-sm text-destructive rounded-md border border-destructive/40 bg-destructive/5 p-3"
          role="alert"
          data-testid="pkce-flow-expired"
        >
          This sign-in request has expired. Go back to {requester} and start signing in again.
        </p>
      }
    />
  );
}

export default PkceFlowExpiryCountdown;
