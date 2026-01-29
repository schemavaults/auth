"use client";

import { createContext } from "react";

export const CreateOrganizationDialogDispatchContext = createContext<
  (val: boolean) => void
>((val: boolean) => {
  void val;
  throw new Error(
    "Not within CreateOrganizationDialogDispatchContext.Provider render tree!",
  );
});

export default CreateOrganizationDialogDispatchContext;
