"use client";

import {
  type ReactElement,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { z } from "zod";
import { useRefreshUserData } from "@schemavaults/auth-react-provider";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, Mail, XCircle } from "lucide-react";
import {
  cn,
  useToast,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Button,
  Input,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  useForm,
} from "@schemavaults/ui";
import { Wordmark } from "@/components/Wordmark";
import { ThemedPageBackground } from "@/components/ThemedPageBackground";
import Link from "next/link";

const requestVerifyEmailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type RequestVerifyEmailData = z.infer<typeof requestVerifyEmailSchema>;

type ConfirmStatus = "pending" | "success" | "error";

function ConfirmVerifyEmailView({ token }: { token: string }): ReactElement {
  const [status, setStatus] = useState<ConfirmStatus>("pending");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const refreshUserData = useRefreshUserData();
  const hasTriggeredTokenRefresh = useRef<boolean>(false);

  // Once the email is verified, refresh the auth tokens (no-op when logged
  // out): the re-minted claims carry email_verified=true, so the account
  // page reflects the verification immediately instead of after a re-login.
  useEffect((): void => {
    if (status !== "success" || hasTriggeredTokenRefresh.current) {
      return;
    }
    hasTriggeredTokenRefresh.current = true;
    refreshUserData().catch((e: unknown): void => {
      console.warn(
        "[ConfirmVerifyEmailView] Failed to refresh auth tokens after email verification:",
        e,
      );
    });
  }, [status, refreshUserData]);

  useEffect(() => {
    let cancelled = false;

    async function confirm(): Promise<void> {
      try {
        const response = await fetch("/api/auth/verify-email/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const result = await response.json();

        if (cancelled) {
          return;
        }

        if (response.ok) {
          setStatus("success");
        } else {
          setErrorMessage(result.message ?? "Something went wrong.");
          setStatus("error");
        }
      } catch (e: unknown) {
        console.error("[ConfirmVerifyEmailView] Error:", e);
        if (!cancelled) {
          setErrorMessage("An error occurred. Please try again.");
          setStatus("error");
        }
      }
    }

    void confirm();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Card
      className={cn(
        "w-11/12 xs:w-10/12 sm:w-3/4 md:w-2/3 lg:w-1/2 xl:w-1/3",
        "bg-white",
        "md:shadow-md",
        "md:rounded-lg",
        "p-4",
        "my-16",
      )}
    >
      <CardHeader>
        <CardTitle>
          Verify your email for <Wordmark />
        </CardTitle>
        <CardDescription>
          {status === "pending" && "Verifying your email address..."}
          {status === "success" && "Your email has been verified."}
          {status === "error" && "We couldn't verify your email address."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-6">
        {status === "pending" && (
          <Loader2 className="h-10 w-10 animate-spin text-gray-500" role="status" />
        )}
        {status === "success" && (
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        )}
        {status === "error" && (
          <>
            <XCircle className="h-10 w-10 text-red-500" />
            <p className="text-center text-sm text-gray-700">
              {errorMessage ?? "Invalid or expired verification token"}
            </p>
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-row justify-center flex-wrap items-center gap-4">
        {status === "success" && (
          <Link
            href="/account"
            className="bg-green-500 hover:bg-green-400 text-white font-semibold px-4 py-2 rounded-md transition-colors duration-200 ease-in-out"
          >
            Continue to your account
          </Link>
        )}
        {status === "error" && (
          <Link
            href="/auth/verify-email"
            className="bg-green-500 hover:bg-green-400 text-white font-semibold px-4 py-2 rounded-md transition-colors duration-200 ease-in-out"
          >
            Resend verification email
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}

function RequestVerifyEmailForm(): ReactElement {
  const { toast } = useToast();
  const [submitting, startSubmitting] = useTransition();

  const form = useForm<RequestVerifyEmailData>({
    resolver: zodResolver(requestVerifyEmailSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: RequestVerifyEmailData): Promise<void> {
    try {
      const response = await fetch("/api/auth/verify-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Check your email",
          description: result.message,
        });
        form.reset();
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message ?? "Something went wrong.",
        });
      }
    } catch (e: unknown) {
      console.error("[RequestVerifyEmailForm] Error:", e);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred. Please try again.",
      });
    }
  }

  return (
    <Card
      className={cn(
        "w-11/12 xs:w-10/12 sm:w-3/4 md:w-2/3 lg:w-1/2 xl:w-1/3",
        "bg-white",
        "md:shadow-md",
        "md:rounded-lg",
        "p-4",
        "my-16",
      )}
    >
      <Form {...form}>
        <CardHeader>
          <CardTitle>
            Verify your email for <Wordmark />
          </CardTitle>
          <CardDescription>
            Enter your email address and we&apos;ll send you a link to verify
            your account.
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={form.handleSubmit((values) => {
            startSubmitting(async () => {
              await onSubmit(values);
            });
          })}
          className="space-y-2"
        >
          <CardContent className="flex flex-col justify-start items-stretch gap-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="name@example.com"
                      autoComplete="email"
                      icon={Mail}
                      {...field}
                      disabled={field.disabled || submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the email address associated with your account.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex flex-row justify-around sm:justify-between flex-wrap items-center gap-4">
            <Button
              type="submit"
              className="bg-green-500 hover:bg-green-400 text-white font-semibold px-4 py-2 rounded-md transition-colors duration-200 ease-in-out"
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" role="status" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}{" "}
              Send Verification Link
            </Button>
            <p className="text-center text-sm text-gray-600">
              Already verified?{" "}
              <Link
                href="/auth/login"
                className="font-semibold text-gray-800"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

export interface VerifyEmailPageViewProps {
  token?: string | null;
}

export function VerifyEmailPageView({ token }: VerifyEmailPageViewProps): ReactElement {
  return (
    <ThemedPageBackground
      className="items-center justify-center flex"
      backgroundClassName="grow min-h-[100dvh] h-full no-scrollbar"
    >
      {token ? <ConfirmVerifyEmailView token={token} /> : <RequestVerifyEmailForm />}
    </ThemedPageBackground>
  );
}

export default VerifyEmailPageView;
