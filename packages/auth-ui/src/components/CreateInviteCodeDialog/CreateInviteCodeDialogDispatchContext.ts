"use client";

import { createContext } from "react";

export const CreateInviteCodeDialogDispatchContext = createContext<
  (val: boolean) => void
>((val: boolean) => {
  void val;
  throw new Error(
    "Not within CreateInviteCodeDialogDispatchContext.Provider render tree!",
  );
});

export default CreateInviteCodeDialogDispatchContext;
