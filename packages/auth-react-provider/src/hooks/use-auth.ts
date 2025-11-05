"use client";

import { useContext } from "react";
import {
  SchemaVaultsAuthContext,
  type SchemaVaultsAuthContextType,
} from "@/contexts/auth-client-context";

export function useAuth(): SchemaVaultsAuthContextType {
  const authContext: SchemaVaultsAuthContextType = useContext(
    SchemaVaultsAuthContext,
  );
  return authContext;
}

export default useAuth;
