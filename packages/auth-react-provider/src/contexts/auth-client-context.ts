import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { createContext, type RefObject } from "react";

export type SchemaVaultsAuthContextType = {
  ready: true;
  client: RefObject<ISchemaVaultsAuthClient | null>;
} | {
  ready: false;
  message: string;
};

/**
 *
 * @name SchemaVaultsAuthContext
 * @see use-auth.ts useAuth
 * */
export const SchemaVaultsAuthContext = createContext<SchemaVaultsAuthContextType>({
  ready: false,
  message: "Ensure useAuth() is only called within a <SchemaVaultsAuthProvider> context."
});
