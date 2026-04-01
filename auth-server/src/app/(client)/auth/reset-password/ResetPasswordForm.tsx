"use client";

import { type ReactElement, useTransition } from "react";
import { z } from "zod";
import { passwordSchema } from "@schemavaults/auth-common";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, KeyRound } from "lucide-react";
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
  PasswordInput,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Wordmark,
  useForm,
  ThemedPageBackground,
} from "@schemavaults/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

// Schema for requesting a password reset (email only)
const requestResetSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

// Schema for setting a new password
const confirmResetSchema = z
  .object({
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type RequestResetData = z.infer<typeof requestResetSchema>;
type ConfirmResetData = z.infer<typeof confirmResetSchema>;

function RequestResetForm(): ReactElement {
  const { toast } = useToast();
  const [submitting, startSubmitting] = useTransition();
  const searchParams = useSearchParams();

  const form = useForm<RequestResetData>({
    resolver: zodResolver(requestResetSchema),
    defaultValues: { email: "" },
  });

  let loginHref = "/auth/login";
  if (searchParams.size > 0) {
    loginHref += `?${searchParams.toString()}`;
  }

  async function onSubmit(values: RequestResetData): Promise<void> {
    try {
      const response = await fetch("/api/auth/reset-password/request", {
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
      console.error("[RequestResetForm] Error:", e);
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
            Reset your <Wordmark /> password
          </CardTitle>
          <CardDescription>
            Enter your email address and we&apos;ll send you a link to reset
            your password.
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
              Send Reset Link
            </Button>
            <p className="text-center text-sm text-gray-600">
              Remember your password?{" "}
              <Link
                href={loginHref}
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

function ConfirmResetForm({ token }: { token: string }): ReactElement {
  const { toast } = useToast();
  const [submitting, startSubmitting] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();

  const form = useForm<ConfirmResetData>({
    resolver: zodResolver(confirmResetSchema),
    defaultValues: { new_password: "", confirm_password: "" },
  });

  let loginHref = "/auth/login";
  if (searchParams.size > 0) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("token");
    if (params.size > 0) {
      loginHref += `?${params.toString()}`;
    }
  }

  async function onSubmit(values: ConfirmResetData): Promise<void> {
    try {
      const response = await fetch("/api/auth/reset-password/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          new_password: values.new_password,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast({
          title: "Password reset successful",
          description: "You can now sign in with your new password.",
        });
        router.push(loginHref);
      } else {
        toast({
          variant: "destructive",
          title: "Reset failed",
          description: result.message ?? "Something went wrong.",
        });
      }
    } catch (e: unknown) {
      console.error("[ConfirmResetForm] Error:", e);
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
            Set a new password
          </CardTitle>
          <CardDescription>
            Enter your new password below.
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={form.handleSubmit(
            (values) => {
              startSubmitting(async () => {
                await onSubmit(values);
              });
            },
            () => {
              toast({
                variant: "destructive",
                title: "Invalid fields",
                description:
                  "Please ensure your inputs are valid and then resubmit.",
              });
            },
          )}
          className="space-y-2"
        >
          <CardContent className="flex flex-col justify-start items-stretch gap-2">
            <FormField
              control={form.control}
              name="new_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      autoComplete="new-password"
                      disabled={field.disabled || submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Must be at least 10 characters with uppercase, lowercase,
                    number, and special character.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      autoComplete="new-password"
                      disabled={field.disabled || submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Please repeat your new password to confirm.
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
                <KeyRound className="h-4 w-4 mr-2" />
              )}{" "}
              Reset Password
            </Button>
            <p className="text-center text-sm text-gray-600">
              Remember your password?{" "}
              <Link
                href={loginHref}
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

export interface ResetPasswordFormProps {
  token?: string | null;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps): ReactElement {
  return (
    <ThemedPageBackground
      className="items-center justify-center flex"
      backgroundClassName="grow min-h-[100dvh] h-full no-scrollbar"
    >
      {token ? <ConfirmResetForm token={token} /> : <RequestResetForm />}
    </ThemedPageBackground>
  );
}

export default ResetPasswordForm;
