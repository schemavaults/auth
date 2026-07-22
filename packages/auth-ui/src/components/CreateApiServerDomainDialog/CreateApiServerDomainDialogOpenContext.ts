"use client";

import type { ApiServerId } from "@schemavaults/app-definitions";
import { createContext } from "react";

export const CreateApiServerDomainDialogOpenContext = createContext<
  ApiServerId | false
>(false);

export const CreateApiServerDomainDialogOpenDispatchContext = createContext<
  (val: ApiServerId | false) => void
>((val: ApiServerId | false) => {
  void val;
  throw new Error(
    "Not within CreateApiServerDomainDialogOpenDispatchContext.Provider render tree!",
  );
});
