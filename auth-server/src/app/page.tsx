import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { ServerRuntime } from "next";
import { redirect } from "next/navigation";

export const runtime: ServerRuntime = 'edge';

async function RedirectToDefaultApp(): Promise<never> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (environment === 'development') {
    console.log("[RedirectToDefaultApp] Redirecting to login page...");
  }
  redirect("/auth/login")
}

export default RedirectToDefaultApp;
