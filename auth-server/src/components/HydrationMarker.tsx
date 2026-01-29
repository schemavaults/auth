"use client";

import { useEffect } from "react";
import { useAuth } from "@schemavaults/auth-react-provider";

export function HydrationMarker(): null {
  const auth = useAuth();

  // Mark basic hydration (component mounted = React hydration complete)
  useEffect(() => {
    document.body.setAttribute("data-hydrated", "true");
    return () => document.body.removeAttribute("data-hydrated");
  }, []);

  // Mark auth provider ready state
  useEffect(() => {
    if (auth.ready) {
      document.body.setAttribute("data-auth-ready", "true");
    } else {
      document.body.removeAttribute("data-auth-ready");
    }
    return () => document.body.removeAttribute("data-auth-ready");
  }, [auth.ready]);

  return null;
}
