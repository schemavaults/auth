"use client";

import { createContext } from "react";

export const AssignOrganizationMemberDialogDispatchContext = createContext<
  (val: boolean) => void
>((val: boolean) => {
  void val;
  throw new Error(
    "Not within AssignOrganizationMemberDialogDispatchContext.Provider render tree!",
  );
});

export default AssignOrganizationMemberDialogDispatchContext;
