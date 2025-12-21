"use client";

import { type ReactElement, useState, useTransition } from "react";
import {
  emailCredentialsSchema,
  emailRegistrationCredentialsSchema,
} from "@schemavaults/auth-common";

// Login / Register functions

import { cn, useToast } from "@schemavaults/ui";
import { Loader2, LogIn, UserPlus } from "lucide-react";
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
import { Input } from "@schemavaults/ui";
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
import { useRouter, useSearchParams } from "next/navigation";
import {
  useAppEnvironment,
  useAuth,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/auth-react-provider";
import { handleAuthFormSubmit } from "./handle-auth-form-submit";
import { AuthFormData } from "./auth-form-data";
import type { AuthFormType } from "./auth-form-type";
import { AuthFormSwapLink } from "./swap-auth-type-link";
import { isPrivateBetaEnabled } from "@/lib/private-beta";

interface AuthFormProps<T extends "login" | "register">
  extends AuthFormType<T> {
  onSuccessfulAuthenticate: OnSuccessfulAuthenticateAction;
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
        ? "Enter your credentials to access your account or sign in with a sign-in provider below."
        : "Create a new account by entering credentials below or using a sign-in provider."}
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
}: AuthFormProps<T>) {
  const appEnv: SchemaVaultsAppEnvironment = useAppEnvironment();

  const { toast } = useToast();
  const form = useForm<AuthFormData<"login" | "register">>({
    resolver: getSchemaResolver({ type }),
    defaultValues: getDefaultValues({ type }),
  });
  const [submitting, startSubmitting] = useTransition();

  const auth = useAuth();

  const searchParams = useSearchParams();

  const router = useRouter();

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
        onSubmitFailure: (): void => {
          console.warn("onSubmitFailure()");
          return;
        },
        auth,
        searchParams,
        router,
        env: appEnv,
      });
      return;
    } catch (e: unknown) {
      console.error("[AuthForm] Error in auth form submit handler: ", e);
      toast({
        variant: "destructive",
        title: "Error submitting form",
        description: "An error occurred while trying to submit the form.",
      });
      return;
    }
  }

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
                    <Input
                      placeholder="**********"
                      {...field}
                      type="password"
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
            {type === "register" ? (
              <FormField
                control={form.control}
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="**********"
                        {...field}
                        type="password"
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
                      />
                    </FormControl>
                    <FormDescription>
                      {isPrivateBetaEnabled() &&
                        "SchemaVaults is currently in closed beta. "}
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
