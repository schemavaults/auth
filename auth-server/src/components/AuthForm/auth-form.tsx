"use client";

import { type ReactElement, useState, useTransition } from "react";
import {
  emailCredentialsSchema,
  emailRegistrationCredentialsSchema,
} from "@schemavaults/auth-common";

// Login / Register functions

import { cn, useToast } from "@schemavaults/ui";
import { Loader2, LogIn, Mail, UserPlus } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import { Input, PasswordInput } from "@schemavaults/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@schemavaults/ui";
import { Wordmark, useForm } from "@schemavaults/ui";
import type { OnSuccessfulAuthenticateAction } from "@/lib/authentication_outcome_type";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useAppEnvironment,
  useAuth,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/auth-react-provider";
import { handleAuthFormSubmit, type PendingAuthorizationState } from "./handle-auth-form-submit";
import { performPostAuthRedirect } from "./perform-post-auth-redirect";
import type { AuthFormData } from "./auth-form-data";
import type { AuthFormType } from "./auth-form-type";
import AuthFormSwapLink from "./swap-auth-type-link";
import type { PartialAppInfo } from "@/lib/PartialAppInfo";
import { AppAuthorizationConsentScreen } from "@/components/AppAuthorizationConsentScreen";


interface AuthFormProps<T extends "login" | "register">
  extends AuthFormType<T> {
  onSuccessfulAuthenticate: OnSuccessfulAuthenticateAction;
  invite_code_required?: boolean;
  debug?: boolean;
  app?: PartialAppInfo | null;
}

function AuthFormCardTitle<T extends "login" | "register">({
  type,
}: AuthFormType<T>): ReactElement {
  return (
    <CardTitle>
      {type === "login" ? "Sign in to " : "Register for "}
      <Wordmark />
    </CardTitle>
  );
}

function AuthFormCardDescription<T extends "login" | "register">({
  type,
}: AuthFormType<T>): ReactElement {
  return (
    <CardDescription>
      {type === "login"
        ? "Enter your credentials to access your account."
        : "Create a new account by entering credentials below."}
    </CardDescription>
  );
}

function getDefaultValues<T extends "login" | "register">({
  type,
}: AuthFormType<T>): AuthFormData<T> {
  if (type === "login") {
    return {
      email: "",
      password: "",
    } as AuthFormData<T>;
  }
  return {
    email: "",
    password: "",
    confirm: "",
    invite_code: "",
  } as AuthFormData<"register">;
}

function getSchemaResolver<T extends "login" | "register">({
  type,
}: AuthFormType<T>) {
  if (type === "login") {
    return zodResolver(emailCredentialsSchema);
  }
  return zodResolver(emailRegistrationCredentialsSchema);
}

export function AuthForm<T extends "login" | "register">({
  type,
  onSuccessfulAuthenticate,
  ...props
}: AuthFormProps<T>) {
  const appEnv: SchemaVaultsAppEnvironment = useAppEnvironment();
  const debug: boolean = props.debug ?? false;

  const { toast } = useToast();
  const form = useForm<AuthFormData<"login" | "register">>({
    resolver: getSchemaResolver({ type }),
    defaultValues: getDefaultValues({ type }),
  });
  const [submitting, startSubmitting] = useTransition();

  const auth = useAuth();

  const searchParams = useSearchParams();
  const router = useRouter();

  const [pendingAuthorization, setPendingAuthorization] = useState<PendingAuthorizationState | null>(null);

  async function resumeRedirectAfterAuthorization(): Promise<void> {
    if (!pendingAuthorization) return;

    toast({
      title: type === "login" ? "Successfully logged in!" : "Successfully registered!",
      description: "Redirecting you back to the requesting app...",
    });

    try {
      await performPostAuthRedirect({
        onSuccessfulAuthenticate,
        authorization_code: pendingAuthorization.authorization_code,
        code_challenge: pendingAuthorization.code_challenge,
        code_verifier: pendingAuthorization.code_verifier,
        redirect_uri: pendingAuthorization.redirect_uri,
        auth,
        router,
        toast,
        env: appEnv,
        debug,
      });
    } catch (e: unknown) {
      console.error("[AuthForm] Error resuming redirect after authorization:", e);
      toast({
        variant: "destructive",
        title: "Redirect failed",
        description: "Failed to redirect back to the requesting app.",
      });
    }
  }

  // Show consent screen if pending authorization
  if (pendingAuthorization && props.app) {
    return (
      <AppAuthorizationConsentScreen
        app_id={props.app.app_id}
        app_name={props.app.app_name}
        app_description={props.app.app_description}
        onSuccessfulAuthenticate={onSuccessfulAuthenticate}
        mode="authorize-only"
        onAuthorizationComplete={resumeRedirectAfterAuthorization}
        pendingAuthState={pendingAuthorization}
        debug={debug}
      />
    );
  }

  async function onAuthFormSubmitValidValues(
    values: AuthFormData<"login" | "register">,
  ): Promise<void> {
    if (appEnv === "development" || appEnv === "test" || appEnv === "staging") {
      console.log("[AuthForm] Submitting...");
    }

    try {
      await handleAuthFormSubmit({
        values,
        toast,
        type,
        onSuccessfulAuthenticate,
        onSubmitFailure: (e: unknown): void => {
          console.warn("onSubmitFailure()", e);
          return;
        },
        auth,
        searchParams,
        router,
        env: appEnv,
        debug,
        app: props.app,
        onAppAuthorizationNeeded: (state: PendingAuthorizationState): void => {
          setPendingAuthorization(state);
        },
      });
      return;
    } catch (e: unknown) {
      let errorMsg: string =
        "An error occurred while trying to submit the form.";
      console.error("[AuthForm] Error in auth form submit handler: ", e);
      if (e instanceof Error) {
        errorMsg = e.message;
      }
      toast({
        variant: "destructive",
        title: "Error submitting auth form",
        description: errorMsg,
      });
      return;
    }
  }

  const invite_code_required: boolean = typeof props.invite_code_required === 'boolean' ? props.invite_code_required : true;

  return (
    <Card
      id={`auth-${type}-form`}
      key={`auth-${type}-form`}
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
          <AuthFormCardTitle type={type} />
          <AuthFormCardDescription type={type} />
        </CardHeader>
        <form
          onSubmit={form.handleSubmit(
            (values: AuthFormData<"login" | "register">) => {
              startSubmitting(async (): Promise<void> => {
                await onAuthFormSubmitValidValues(values);
              });
            },
            function onBadAuthFormValues(e): void {
              console.error("[onBadAuthFormValues()] form errors: ", e);
              toast({
                variant: "destructive",
                title: "Invalid field(s) in authentication form",
                description:
                  "Please ensure your inputs are valid and then resubmit.",
              });
              return;
            },
          )}
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
                      name={field.name}
                      disabled={field.disabled || submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Please enter your email address.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      autoComplete={
                        type === "login" ? "current-password" : "new-password"
                      }
                      name={field.name}
                      disabled={field.disabled || submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Please enter {type === "login" ? "your" : "a"} secret
                    password. Never share it with anyone else.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {type === "login" ? (
              <div className="text-right">
                <Link
                  href={
                    "/auth/reset-password" +
                    (searchParams.size > 0 ? `?${searchParams.toString()}` : "")
                  }
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Forgot password?
                </Link>
              </div>
            ) : null}
            {type === "register" ? (
              <FormField
                control={form.control}
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <PasswordInput
                        {...field}
                        autoComplete="new-password"
                        name={field.name}
                        disabled={field.disabled || submitting}
                      />
                    </FormControl>
                    <FormDescription>
                      Please repeat your password to make sure you remember it.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {type === "register" ? (
              <FormField
                control={form.control}
                name="invite_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invite Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="MY_INVITE_CODE"
                        {...field}
                        name={field.name}
                        disabled={field.disabled || submitting}
                        required={invite_code_required}
                      />
                    </FormControl>
                    <FormDescription>
                      {invite_code_required &&
                        "An invite code is currently required to register using this form. "}
                      {"If you have an invite code, enter it here."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-row justify-around sm:justify-between flex-wrap items-center gap-4">
            <Button
              type="submit"
              className="bg-green-500 hover:bg-green-400 text-white font-semibold px-4 py-2 rounded-md transition-colors duration-200 ease-in-out"
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" role="status" />
              ) : type === "login" ? (
                <LogIn className="h-4 w-4 mr-2" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}{" "}
              {type === "login" ? "Sign in" : "Register"}
            </Button>
            <AuthFormSwapLink type={type} />
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

export default AuthForm;
