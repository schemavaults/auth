import "server-only";
import redirectWithError from "@/lib/redirect-with-error";
import { type AppId, appIdSchema } from "@schemavaults/app-definitions";

export default function validateAppIdSearchParamOrRedirectWithError(maybe_valid_app_id: unknown): maybe_valid_app_id is AppId | undefined {
  if (typeof maybe_valid_app_id !== 'string' && typeof maybe_valid_app_id !== 'undefined') {
    console.warn("Invalid search param 'app_id'; not a string or undefined!")
    redirectWithError(400, 'bad_request') satisfies never;
  }
  if (typeof maybe_valid_app_id === 'string' && !appIdSchema.safeParse(maybe_valid_app_id).success) {
    console.warn("Invalid search param 'app_id'; bad string!")
    redirectWithError(400, 'bad_request') satisfies never;
  }
  return true;
}
