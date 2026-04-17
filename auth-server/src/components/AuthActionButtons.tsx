"use client";

import { useAuth, useCurrentUser } from "@schemavaults/auth-react-provider";
import { Button, cn } from "@schemavaults/ui";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
} from "@schemavaults/ui/framer-motion";
import { Loader2, LogIn, User, UserPlus } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

interface AuthActionButtonsProps {
  className?: string;
}

export default function AuthActionButtons({
  className,
}: AuthActionButtonsProps): ReactElement {
  const auth = useAuth();
  const currentUser = useCurrentUser();

  const state: "loading" | "authenticated" | "unauthenticated" = !auth.ready
    ? "loading"
    : currentUser !== null
      ? "authenticated"
      : "unauthenticated";

  const motionProps = {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    transition: { duration: 0.18, ease: "easeOut" },
  } as const;

  return (
    <LazyMotion features={domAnimation} strict>
      <div
        className={cn(
          "flex flex-row justify-center flex-wrap items-center gap-4",
          className,
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {state === "loading" ? (
            <m.div key="loading" {...motionProps} role="status">
              <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </m.div>
          ) : state === "authenticated" ? (
            <m.div key="authenticated" {...motionProps}>
              <Button
                asChild
                className="bg-green-500 hover:bg-green-400 text-white font-semibold px-4 py-2 rounded-md transition-colors duration-200 ease-in-out"
              >
                <Link href="/account">
                  <User className="h-4 w-4 mr-2" />
                  Go to Account
                </Link>
              </Button>
            </m.div>
          ) : (
            <m.div
              key="unauthenticated"
              {...motionProps}
              className="flex flex-row justify-center flex-wrap items-center gap-4"
            >
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
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </LazyMotion>
  );
}
