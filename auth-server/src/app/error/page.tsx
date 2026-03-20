// {auth_server}/error/page.tsx
import "server-only";

import {
  ERROR_MESSAGE_CATALOG,
  isValidErrorId,
} from "@schemavaults/auth-common/auth-error-message-catalog";
import type { ReactElement } from "react";
import ErrorPageView from "./error_page_view";

export default async function ErrorPageComponent(input: {
  params?: Promise<unknown>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<ReactElement> {
  let error: number = 500;
  let message: string = "An unknown error occurred" as const;

  try {
    if (input.searchParams) {
      const searchParams = await input.searchParams;

      const allowedKeys = ["error", "error_id"];
      const keys = Object.keys(searchParams);

      if (keys.some((key) => !allowedKeys.includes(key))) {
        throw new Error("Unexpected search parameter key found");
      }

      if (!searchParams["error"]) {
        throw new Error(
          "Expected to receive error status code if search params provided",
        );
      }
      if (
        typeof searchParams["error"] !== "string" ||
        Array.isArray(searchParams["error"])
      ) {
        throw new Error(
          "Expected 'error' search parameter to be an integer encoded as a string",
        );
      }
      const errorCode = parseInt(searchParams["error"]);
      if (isNaN(errorCode)) {
        throw new Error(
          "Expected 'error' search parameter to be a valid integer!",
        );
      }
      if (errorCode < 400 || errorCode >= 600) {
        throw new Error(
          "Error code outside of HTTP status code range (400-599)",
        );
      }
      error = errorCode;

      if (typeof searchParams["error_id"] === "string") {
        if (isValidErrorId(searchParams["error_id"])) {
          message = ERROR_MESSAGE_CATALOG[
            searchParams["error_id"]
          ] satisfies string;
        }
      }
    }
  } catch (e: unknown) {
    console.error("There was an error displaying the actual error: ", e);
    error = 500;
    message = "Double error! There was an error displaying the actual error :(";
  }

  return <ErrorPageView error={error} message={message} />;
}
