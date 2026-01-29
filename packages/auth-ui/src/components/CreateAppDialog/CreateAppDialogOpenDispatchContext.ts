"use client";

import { createContext } from "react";

export const CreateAppDialogOpenDispatchContext = createContext<
  (val: boolean) => void
>((val: boolean) => {
  void val;
  throw new Error(
    "Not within CreateAppDialogOpenDispatchContext.Provider render tree!",
  );
});

export default CreateAppDialogOpenDispatchContext;
