"use client";

import { createContext } from "react";

export const ConnectAppToApiDialogOpenDispatchContext = createContext<
  (val: boolean) => void
>((val: boolean) => {
  void val;
  throw new Error(
    "Not within ConnectAppToApiDialogOpenDispatchContext.Provider render tree!",
  );
});

export default ConnectAppToApiDialogOpenDispatchContext;
