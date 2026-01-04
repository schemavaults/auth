"use client";

import { Button } from "@schemavaults/ui";
import type { PropsWithChildren, ReactElement, ReactNode } from "react";
import { LogOut } from "lucide-react";

export interface SignOutButtonProps {
  logout_page_href?: string;
  Link: ({ href, children }: PropsWithChildren<{ href: string }>) => ReactNode;
}

export function SignOutButton({
  logout_page_href,
  Link,
}: SignOutButtonProps): ReactElement {
  const defaultLogoutPageHref: string = "/auth/logout" as const;
  return (
    <Link
      href={
        typeof logout_page_href === "string"
          ? logout_page_href
          : defaultLogoutPageHref
      }
    >
      <Button variant={"destructive"} id="sign-out-button">
        <span className="flex flex-row justify-start items-center">
          <LogOut className="h-4 w-4 mr-2" key="sign-out-icon" /> Sign out
        </span>
      </Button>
    </Link>
  );
}

export default SignOutButton;
