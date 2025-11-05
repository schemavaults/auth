import { RedirectType, redirect as nextRedirect } from "next/navigation";
import {
  isValidErrorId,
  type SchemaVaultsAuthErrorId,
} from "./error-message-catalog";

const errorEndpoint = "/error" as const;

export function redirectWithError(
  redirect: (url: string, redirect_type?: RedirectType) => never = nextRedirect,
  error_code: number = 500,
  error_id: SchemaVaultsAuthErrorId = "unknown",
): never {
  if (!isValidErrorId(error_id)) {
    throw new Error("Invalid error ID to redirect to error page with!");
  }

  const searchParams = new URLSearchParams();

  searchParams.set("error", `${error_code}` as const);
  searchParams.set("error_id", error_id);

  const errorPageUrl = `${errorEndpoint}?${searchParams.toString()}` as const;

  if (process.env.NODE_ENV === "development") {
    console.log("[redirectWithError] Redirecting to URL: ", errorPageUrl);
  }
  redirect(errorPageUrl);
}

export default redirectWithError;
