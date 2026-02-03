"use client";

import { createContext } from "react";

export const InviteMemberDialogDispatchContext = createContext<
  (val: boolean) => void
>((val: boolean) => {
  void val;
  throw new Error(
    "Not within InviteMemberDialogDispatchContext.Provider render tree!",
  );
});

export default InviteMemberDialogDispatchContext;
