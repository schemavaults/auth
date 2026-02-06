"use client";

import type { AppId } from "@schemavaults/app-definitions";
import { createContext } from "react";

export const CreateAppDomainDialogOpenContext = createContext<AppId | false>(
  false,
);

export const CreateAppDomainDialogOpenDispatchContext = createContext<
  (val: AppId | false) => void
>((val: AppId | false) => {
  void val;
  throw new Error(
    "Not within CreateAppDomainDialogOpenDispatchContext.Provider render tree!",
  );
});
