"use client";

import { type ReactElement, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  useToast,
} from "@schemavaults/ui";
import { ArrowRight, Loader2, Mail, MailCheck } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { ThemedPageBackground } from "@/components/ThemedPageBackground";
import type { PartialAppInfo } from "@/lib/PartialAppInfo";

export interface EmailVerificationRequiredViewProps {
  /** The third-party client app waiting for the user (name shown as inert text). */
  app: PartialAppInfo;
  /** The signed-in user's (unverified) e-mail address. */
  email: string;
  /** Same-origin path that resumes the parked authorize flow (`/auth/login?…`). */
  resume_href: string;
  /**
   * The auth server's own app id, for the `whoami` poll that notices the
   * verification completing in another tab (the e-mailed link opens one).
   */
  auth_server_app_id: string;
  debug?: boolean;
}

// How often the page asks the server whether the address got verified in
// the meantime, and for how long before it stops (the user can always use
// the "Continue" button, and the flow's PKCE challenge expires anyway).
const VERIFICATION_POLL_INTERVAL_MS = 5_000;
const VERIFICATION_POLL_MAX_DURATION_MS = 30 * 60 * 1_000;

/**
 * "Verify your email to continue to <app>" — the card an unverified user
 * sees instead of being redirected to a third-party client application.
 * Offers re-sending the verification link, and resumes the hand-off as
 * soon as the address is verified (detected by polling `whoami`, which
 * re-reads the row) or when the user says they verified it.
 */
export function EmailVerificationRequiredView({
  app,
  email,
  resume_href,
  auth_server_app_id,
  debug,
}: EmailVerificationRequiredViewProps): ReactElement {
  const { toast } = useToast();
  const [sending, startSending] = useTransition();
  const [continuing, setContinuing] = useState<boolean>(false);
  const hasResumed = useRef<boolean>(false);

  function resumeFlow(): void {
    if (hasResumed.current) return;
    hasResumed.current = true;
    setContinuing(true);
    if (debug) {
      console.log("[EmailVerificationRequiredView] Resuming authorize flow:", resume_href);
    }
    window.location.assign(resume_href);
  }

  // Notice the verification completing (the e-mailed link is usually
  // opened in another tab) without the user having to come back and click:
  // `whoami` reloads the row, so `email_verified` flips as soon as the
  // token is consumed. The auth server session cookie authenticates it.
  useEffect((): (() => void) => {
    let cancelled = false;
    let timer: number | undefined = undefined;
    const startedAt: number = Date.now();
    const endpoint: string = `/api/auth/whoami/${encodeURIComponent(auth_server_app_id)}`;

    async function poll(): Promise<void> {
      if (cancelled || hasResumed.current) return;
      if (Date.now() - startedAt > VERIFICATION_POLL_MAX_DURATION_MS) return;
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (response.ok) {
          const body: unknown = await response.json();
          const verified: boolean =
            typeof body === "object" &&
            body !== null &&
            "user" in body &&
            typeof (body as { user?: unknown }).user === "object" &&
            (body as { user?: { email_verified?: unknown } }).user?.email_verified === true;
          if (verified && !cancelled) {
            toast({
              title: "Email verified",
              description: `Sending you to ${app.app_name}...`,
            });
            resumeFlow();
            return;
          }
        }
      } catch (e: unknown) {
        if (debug) {
          console.warn("[EmailVerificationRequiredView] whoami poll failed:", e);
        }
      }
      if (!cancelled) {
        timer = window.setTimeout(() => void poll(), VERIFICATION_POLL_INTERVAL_MS);
      }
    }

    timer = window.setTimeout(() => void poll(), VERIFICATION_POLL_INTERVAL_MS);
    return (): void => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per page load
  }, []);

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
        console.error("[EmailVerificationRequiredView] Resend failed:", e);
        toast({
          variant: "destructive",
          title: "Failed to send verification email",
          description: e instanceof Error ? e.message : "An unknown error occurred.",
        });
      }
    });
  }

  return (
    <ThemedPageBackground
      className="items-center justify-center flex"
      backgroundClassName="grow min-h-[100dvh] h-full no-scrollbar"
    >
      <Card
        className={cn(
          "w-11/12 xs:w-10/12 sm:w-3/4 md:w-2/3 lg:w-1/2 xl:w-1/3",
          "bg-white",
          "md:shadow-md",
          "md:rounded-lg",
          "p-4",
          "my-16",
        )}
        data-testid="email-verification-required-card"
      >
        <CardHeader>
          <CardTitle>
            Verify your email for <Wordmark />
          </CardTitle>
          <CardDescription className="break-words">
            Before we can send you to{" "}
            <strong data-testid="email-verification-required-app-name">
              {app.app_name}
            </strong>
            , please verify your email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col items-center justify-center gap-2 py-2">
            <MailCheck className="h-10 w-10 text-green-500" aria-hidden="true" />
            <p className="text-center text-sm text-gray-700">
              We sent a verification link to{" "}
              <strong
                className="break-all"
                data-testid="email-verification-required-email"
              >
                {email}
              </strong>
              . Open it to verify your address; this page will continue on
              its own once you have.
            </p>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Didn&apos;t get the email? Check your spam folder or request a
            new link. Signed in with the wrong account?{" "}
            <Link href="/auth/logout" className="font-semibold text-gray-800">
              Sign out
            </Link>
            .
          </p>
        </CardContent>
        <CardFooter className="flex flex-row justify-around sm:justify-between flex-wrap items-center gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleResend}
            disabled={sending || continuing}
            data-testid="resend-verification-email-button"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" role="status" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            Resend verification email
          </Button>
          <Button
            type="button"
            onClick={resumeFlow}
            disabled={continuing}
            className="bg-green-500 hover:bg-green-400 text-white font-semibold px-4 py-2 rounded-md transition-colors duration-200 ease-in-out"
            data-testid="continue-after-email-verification-button"
          >
            {continuing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" role="status" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-2" />
            )}
            I&apos;ve verified my email
          </Button>
        </CardFooter>
      </Card>
    </ThemedPageBackground>
  );
}

export default EmailVerificationRequiredView;
