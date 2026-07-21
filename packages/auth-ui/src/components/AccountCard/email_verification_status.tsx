"use client";

import { type ReactElement, useState, useTransition } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
  useToast,
} from "@schemavaults/ui";
import { CheckCircle2, Loader2, Mail, XCircle } from "lucide-react";

export interface EmailVerificationStatusProps {
  /** The current user's email address (the address a verification email would be re-sent to). */
  email: string;
  /** Whether the user's email address has been verified. */
  verified: boolean;
  /**
   * The /api/auth/verify-email/request endpoint does not support cross-origin
   * requests, so the in-dialog resend POST is only offered on the auth
   * server's own /account page; external resource servers get a button that
   * navigates to the auth server's /auth/verify-email page instead.
   */
  isAuthServerAccountPage?: boolean;
  auth_server_url: string;
  redirect: (url: string) => Promise<void>;
}

/**
 * Inline email-verification indicator for the account details card: renders a
 * green check ("Verified") or red x ("Not verified") next to the user's email
 * address, and opens a status dialog on click. When the email is unverified,
 * the dialog offers re-sending the verification email.
 */
export function EmailVerificationStatus(
  props: EmailVerificationStatusProps,
): ReactElement {
  const { email, verified } = props;
  const [open, setOpen] = useState(false);
  const [sending, startSending] = useTransition();
  const { toast } = useToast();

  function handleResend(): void {
    startSending(async () => {
      try {
        const endpoint: string = new URL(
          "/api/auth/verify-email/request",
          props.auth_server_url,
        ).toString();
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message ?? "Something went wrong.");
        }

        toast({
          title: "Check your email",
          description:
            result.message ?? "A verification email has been sent.",
        });
        setOpen(false);
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to send verification email",
          description:
            error instanceof Error
              ? error.message
              : "An unknown error occurred.",
        });
      }
    });
  }

  async function handleGoToVerifyEmailPage(): Promise<void> {
    const verifyEmailPageUrl: string = new URL(
      "/auth/verify-email",
      props.auth_server_url,
    ).toString();
    await props.redirect(verifyEmailPageUrl);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={
          verified
            ? "Email verified. View verification status."
            : "Email not verified. Open dialog to resend verification email."
        }
        data-testid="email-verification-status-button"
        className="flex flex-row flex-nowrap items-center gap-1 px-2"
      >
        {verified ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
        <span
          className={cn(
            "text-xs",
            verified ? "text-green-600" : "text-red-600",
          )}
        >
          {verified ? "Verified" : "Not verified"}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          id="email-verification-dialog-content"
          data-testid="email-verification-dialog-content"
          className="sm:max-w-[425px]"
        >
          <DialogHeader>
            <DialogTitle>
              {verified ? "Email verified" : "Verify your email"}
            </DialogTitle>
            <DialogDescription>
              {verified
                ? `Your email address (${email}) has been verified.`
                : `Your email address (${email}) has not been verified yet. Check your inbox for a verification link, or request a new one below.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center py-4">
            {verified ? (
              <CheckCircle2 className="h-10 w-10 text-green-500" />
            ) : (
              <XCircle className="h-10 w-10 text-red-500" />
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={sending}
              data-testid="close-email-verification-dialog-button"
            >
              Close
            </Button>
            {!verified &&
              (props.isAuthServerAccountPage ? (
                <Button
                  type="button"
                  onClick={handleResend}
                  disabled={sending}
                  data-testid="resend-verification-email-button"
                >
                  {sending ? (
                    <Loader2
                      className="h-4 w-4 mr-2 animate-spin"
                      role="status"
                    />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Resend verification email
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void handleGoToVerifyEmailPage()}
                  data-testid="resend-verification-email-button"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Verify your email
                </Button>
              ))}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default EmailVerificationStatus;
