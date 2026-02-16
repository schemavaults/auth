import type { RedirectType } from "next/navigation";
import {
  isValidErrorId,
  type SchemaVaultsAuthErrorId,
} from "@/auth-server-error-message-catalog";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export function redirectWithError(
  redirect: (url: string, redirect_type?: RedirectType) => never,
  error_code: number = 500,
  error_id: SchemaVaultsAuthErrorId = "unknown",
  error_page_url: string = "/error",
): never {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (!isValidErrorId(error_id)) {
    throw new Error("Invalid error ID to redirect to error page with!");
  }

  const searchParams = new URLSearchParams();

  searchParams.set("error", `${error_code}` as const);
  searchParams.set("error_id", error_id);

  const errorPageUrl = `${error_page_url}?${searchParams.toString()}` as const;

  if (environment === "development") {
    console.log("[redirectWithError] Redirecting to URL: ", errorPageUrl);
  }
  redirect(errorPageUrl);
}

export default redirectWithError;
