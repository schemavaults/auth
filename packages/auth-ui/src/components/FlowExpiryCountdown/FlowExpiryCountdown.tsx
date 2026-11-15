"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { CircularProgress, cn } from "@schemavaults/ui";
import { describeFlowExpiry, type FlowExpiry } from "./describe-flow-expiry";

export interface FlowExpiryCountdownProps {
  /** When the flow expires (Unix epoch ms). */
  expires_at: number;
  /**
   * The flow's whole lifetime in ms (a full ring). Omit when unknown: the
   * ring then starts full at whatever was left when it mounted.
   */
  duration_ms?: number;
  /**
   * What expires, completing "… expires in 4 minutes": e.g. "This sign-in
   * request", "This code". Defaults to "This request".
   */
  subject?: string;
  /** Shown instead of the countdown once the flow expired. */
  expiredContent?: ReactNode;
  /** Called once, when the flow expires (also when it mounts already expired). */
  onExpired?: () => void;
  /** Ring size; `sm` fits beside a card title, `default` stands on its own. */
  size?: "sm" | "default";
  className?: string;
}

const TICK_MS = 1000;

/**
 * A countdown ring (`CircularProgress` from `@schemavaults/ui`) for an
 * authorization flow that expires at a fixed time: a device code, a PKCE
 * sign-in request, an MFA challenge. The ring empties as the deadline nears
 * and turns amber, then red; beside it, the time left in words.
 *
 * It renders nothing time-dependent until it has mounted, so the server's
 * clock never meets the browser's during hydration. Screen readers get the
 * ring as a progressbar with the time left as its value text; the label is
 * not a live region, so it is not read out every second.
 */
export function FlowExpiryCountdown({
  expires_at,
  duration_ms,
  subject = "This request",
  expiredContent,
  onExpired,
  size = "default",
  className,
}: FlowExpiryCountdownProps): ReactElement {
  const [now, setNow] = useState<number | null>(null);
  const [mountedRemaining, setMountedRemaining] = useState<number | null>(null);
  const expiredReported = useRef<boolean>(false);
  const onExpiredRef = useRef<typeof onExpired>(onExpired);

  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    const start: number = Date.now();
    setNow(start);
    setMountedRemaining(Math.max(0, expires_at - start));
    expiredReported.current = false;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [expires_at]);

  const expiry: FlowExpiry | null =
    now === null
      ? null
      : describeFlowExpiry({
          now,
          expires_at,
          duration_ms,
          fallback_duration_ms: mountedRemaining ?? undefined,
        });

  useEffect(() => {
    if (expiry?.expired && !expiredReported.current) {
      expiredReported.current = true;
      onExpiredRef.current?.();
    }
  }, [expiry?.expired]);

  if (expiry?.expired && expiredContent !== undefined) {
    return <>{expiredContent}</>;
  }

  const sentence: string =
    expiry === null
      ? `${subject} expires soon.`
      : expiry.expired
        ? `${subject} has expired.`
        : `${subject} expires in ${expiry.spoken_label}.`;

  return (
    <div
      className={cn("flex flex-row items-center gap-3", className)}
      data-testid="flow-expiry-countdown"
      data-expired={expiry?.expired === true ? "true" : "false"}
    >
      <CircularProgress
        value={expiry === null ? 100 : Math.round(expiry.fraction * 1000) / 10}
        label={`Time left before ${subject.charAt(0).toLowerCase()}${subject.slice(1)} expires`}
        aria-valuetext={expiry === null ? undefined : expiry.spoken_label}
        size={size}
        color={expiry?.tone ?? "default"}
        showValue={false}
      >
        <span data-testid="flow-expiry-countdown-ring-label">
          {expiry === null ? "" : expiry.compact_label}
        </span>
      </CircularProgress>
      <p
        className={cn(
          "text-sm",
          expiry?.tone === "destructive"
            ? "text-destructive"
            : "text-muted-foreground",
        )}
        data-testid="flow-expiry-countdown-text"
      >
        {sentence}
      </p>
    </div>
  );
}

export default FlowExpiryCountdown;
