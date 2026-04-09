"use client";

import OnLogoutContext, {
  type OnLogoutCallback,
} from "@/contexts/on-logout-context";
import { useContext } from "react";

export function useOnLogout(): OnLogoutCallback | null {
  return useContext(OnLogoutContext);
}

export default useOnLogout;
