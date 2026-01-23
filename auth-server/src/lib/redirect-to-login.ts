import "server-only";
import { redirectToLogin as doRedirectToLogin } from "@schemavaults/auth-server-sdk";
import { redirect } from "next/navigation";

export default function redirectToLogin(next: string | undefined = undefined): never {
  return doRedirectToLogin(redirect, next)
}
