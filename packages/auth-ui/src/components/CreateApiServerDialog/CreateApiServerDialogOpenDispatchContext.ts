"use client";

import { createContext } from "react";

export const CreateApiServerDialogOpenDispatchContext = createContext<
  (val: boolean) => void
>((val: boolean) => {
  void val;
  throw new Error(
    "Not within CreateApiServerDialogOpenDispatchContext.Provider render tree!",
  );
});

export default CreateApiServerDialogOpenDispatchContext;
