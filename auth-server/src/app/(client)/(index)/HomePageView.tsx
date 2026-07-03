"use client";

import { useAuth, useCurrentUser } from "@schemavaults/auth-react-provider";
import {
  cn,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@schemavaults/ui";
import { Wordmark } from "@/components/Wordmark";
import { ThemedPageBackground } from "@/components/ThemedPageBackground";
import { HelpCircle } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";
import { AuthActionButtons } from "@schemavaults/auth-ui";

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
        <CardContent>
          <AuthActionButtons />
        </CardContent>
        <CardFooter className="justify-center">
          <Link
            href="/help"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
          >
            <HelpCircle className="h-4 w-4" />
            Help & FAQ
          </Link>
        </CardFooter>
      </Card>
    </ThemedPageBackground>
  );
}
