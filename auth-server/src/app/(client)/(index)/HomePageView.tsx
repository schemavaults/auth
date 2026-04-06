"use client";

import { useAuth, useCurrentUser } from "@schemavaults/auth-react-provider";
import {
  cn,
  ThemedPageBackground,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Wordmark,
} from "@schemavaults/ui";
import { Loader2, LogIn, UserPlus, User } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

export default function HomePageView(): ReactElement {
  const auth = useAuth();
  const currentUser = useCurrentUser();

  const isLoading = !auth.ready;
  const isAuthenticated = auth.ready && currentUser !== null;

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
          "my-16"
        )}
      >
        <CardHeader>
          <CardTitle>
            Welcome to <Wordmark />
          </CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading..."
              : isAuthenticated
                ? `Signed in as ${currentUser.email}`
                : "Sign in or create an account to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-row justify-center flex-wrap items-center gap-4">
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" role="status" />
          ) : isAuthenticated ? (
            <Button
              asChild
              className="bg-green-500 hover:bg-green-400 text-white font-semibold px-4 py-2 rounded-md transition-colors duration-200 ease-in-out"
            >
              <Link href="/account">
                <User className="h-4 w-4 mr-2" />
                Go to Account
              </Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                className="bg-green-500 hover:bg-green-400 text-white font-semibold px-4 py-2 rounded-md transition-colors duration-200 ease-in-out"
              >
                <Link href="/auth/login">
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign In
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="font-semibold px-4 py-2 rounded-md transition-colors duration-200 ease-in-out"
              >
                <Link href="/auth/register">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Register
                </Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </ThemedPageBackground>
  );
}
