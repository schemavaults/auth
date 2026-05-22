"use client";

import {
  useAuth,
  useCurrentUser,
  useRedirectUrlConfiguration,
} from "@schemavaults/auth-react-provider";
import { Button, cn } from "@schemavaults/ui";
import { AnimatePresence, m } from "@schemavaults/ui/framer-motion";
import { Loader2, LogIn, User, UserPlus } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

interface AuthActionButtonsProps {
  authenticatedLinkLabel?: string;
  className?: string;
}

export function AuthActionButtons({
  className,
  authenticatedLinkLabel = "Go to Account",
}: AuthActionButtonsProps): ReactElement {
  const auth = useAuth();
  const currentUser = useCurrentUser();
  const redirectUrls = useRedirectUrlConfiguration();

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
              <Link href={redirectUrls.authed_on_unauthed_redirect_uri}>
                <User className="h-4 w-4 mr-2" />
                {authenticatedLinkLabel}
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
              <Link href={redirectUrls.login_uri satisfies string}>
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="font-semibold px-4 py-2 rounded-md transition-colors duration-200 ease-in-out"
            >
              <Link href={redirectUrls.register_uri satisfies string}>
                <UserPlus className="h-4 w-4 mr-2" />
                Register
              </Link>
            </Button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AuthActionButtons;
