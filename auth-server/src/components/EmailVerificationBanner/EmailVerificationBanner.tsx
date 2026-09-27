"use client";

import { type ReactElement, useTransition } from "react";
import { useCurrentUser } from "@schemavaults/auth-react-provider";
import { Button, cn, useToast } from "@schemavaults/ui";
import { Loader2, Mail, MailWarning } from "lucide-react";

export interface EmailVerificationBannerProps {
  className?: string;
}

/**
 * A nudge shown on every authenticated dashboard page while the signed-in
 * user's e-mail address is unverified: verification is what lets the auth
 * server hand them off to connected (third-party) applications, so the
 * banner says why it matters and offers to re-send the link. Renders
 * nothing for verified users, service accounts, or before the user data is
 * available.
 */
export function EmailVerificationBanner({
  className,
}: EmailVerificationBannerProps): ReactElement | null {
  const user = useCurrentUser();
  const { toast } = useToast();
  const [sending, startSending] = useTransition();

  if (!user || user.email_verified !== false || user.service_account === true) {
    return null;
  }
  const email: string = user.email;

  function handleResend(): void {
    startSending(async (): Promise<void> => {
      try {
        const response = await fetch("/api/auth/verify-email/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const result: { message?: string } = await response.json();
        if (!response.ok) {
          throw new Error(result.message ?? "Something went wrong.");
        }
        toast({
          title: "Check your email",
          description: result.message ?? "A verification email has been sent.",
        });
      } catch (e: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to send verification email",
          description: e instanceof Error ? e.message : "An unknown error occurred.",
        });
      }
    });
  }

  return (
    <div
      role="status"
      data-testid="email-verification-banner"
      className={cn(
        "flex flex-row flex-wrap items-center justify-between gap-3",
        "rounded-md border border-amber-300 bg-amber-50 text-amber-900",
        "px-4 py-3 text-sm",
        className,
      )}
    >
      <div className="flex flex-row items-start gap-2 min-w-0">
        <MailWarning className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="break-words">
          <strong>Your email address isn&apos;t verified yet.</strong> Verify{" "}
          <span className="break-all">{email}</span> to sign in to connected
          applications with this account.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleResend}
        disabled={sending}
        data-testid="email-verification-banner-resend-button"
        className="shrink-0"
      >
        {sending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" role="status" />
        ) : (
          <Mail className="h-4 w-4 mr-2" />
        )}
        Resend verification email
      </Button>
    </div>
  );
}

export default EmailVerificationBanner;
