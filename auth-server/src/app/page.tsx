import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { ServerRuntime } from "next";
import { redirect } from "next/navigation";

export const runtime: ServerRuntime = 'edge';

async function RedirectToDefaultApp(): Promise<never> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (environment === 'development') {
    console.log("Redirecting to default app...");
    redirect("http://localhost:3000")
  }
  redirect("https://schemavaults.com")
}

export default RedirectToDefaultApp;
