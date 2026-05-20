import type { RedirectType } from "next/navigation";
import {
  isValidErrorId,
  type SchemaVaultsAuthErrorId,
} from "@schemavaults/auth-common";

export function redirectWithError(
  redirect: (url: string, redirect_type?: keyof typeof RedirectType) => never,
  error_code: number = 500,
  error_id: SchemaVaultsAuthErrorId = "unknown",
  error_page_url: string = "/auth/error",
): never {
  if (!isValidErrorId(error_id)) {
    throw new Error("Invalid error ID to redirect to error page with!");
  }

  const searchParams = new URLSearchParams();

  searchParams.set("error", `${error_code}` as const);
  searchParams.set("error_id", error_id);

  const errorPageUrl = `${error_page_url}?${searchParams.toString()}` as const;

  // Always log error-page redirects (in every environment) so production
  // misconfigurations are diagnosable from server logs. The caller is
  // expected to have already logged the *cause*; this is the audit trail
  // for the redirect itself.
  console.warn(
    `[redirectWithError] Redirecting to error page '${errorPageUrl}' (error_code=${error_code}, error_id='${error_id}')`,
  );
  redirect(errorPageUrl);
}

export default redirectWithError;
