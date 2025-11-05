import { ServerRuntime } from "next";
import { redirect } from "next/navigation";

export const runtime: ServerRuntime = 'edge';

async function RedirectToDefaultApp(): Promise<never> {
  if (process.env.NODE_ENV === 'development') {
    console.log("Redirecting to default app...");
    redirect("http://localhost:3000")
  }
  redirect("https://schemavaults.com")
}

export default RedirectToDefaultApp;
