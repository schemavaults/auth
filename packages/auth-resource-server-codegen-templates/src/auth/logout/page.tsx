"use client";

import { useLogoutEffect } from "@schemavaults/auth-react-provider";
import { LoadingPage } from "@schemavaults/ui";
import type { ReactElement } from "react";

export default function LogoutPage(): ReactElement {
  useLogoutEffect();

  return <LoadingPage message="Logging you out..." />;
}
