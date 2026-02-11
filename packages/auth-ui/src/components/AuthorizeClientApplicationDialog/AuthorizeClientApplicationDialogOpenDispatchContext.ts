"use client";

import { createContext } from "react";

export const AuthorizeClientApplicationDialogOpenDispatchContext = createContext<
  (val: boolean) => void
>((val: boolean) => {
  void val;
  throw new Error(
    "Not within AuthorizeClientApplicationDialogOpenDispatchContext.Provider render tree!",
  );
});

export default AuthorizeClientApplicationDialogOpenDispatchContext;
