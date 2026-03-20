import "server-only";
import { redirectWithError as _redirectWithError } from "@schemavaults/auth-server-sdk";
import { redirect } from "next/navigation";
import type { SchemaVaultsAuthErrorId } from "@schemavaults/auth-common";

const errorPage: string = "/error"

export default function redirectWithError(
  error_code: number = 500,
  error_id: SchemaVaultsAuthErrorId = "unknown"
): never {
  return _redirectWithError(redirect, error_code, error_id, errorPage)
}
