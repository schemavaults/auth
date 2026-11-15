import "server-only";
import type { ReactElement } from "react";
import type { ServerRuntime } from "next";
import { connection } from "next/server";
import {
  DEVICE_VERIFICATION_PATH,
  DEVICE_VERIFICATION_USER_CODE_PARAM,
  formatUserCode,
  normalizeUserCode,
} from "@schemavaults/auth-common";
import { DeviceVerificationPageView } from "@/components/DeviceVerification";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";

/**
 * `/device`: the device authorization grant's verification page (RFC 8628
 * `verification_uri`). Signed-out visitors are sent through the login page
 * and back here, with the code from `verification_uri_complete`
 * (`?user_code=…`) kept; a malformed code is dropped, so the user types it.
 */
export default async function DeviceVerificationPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<ReactElement> {
  await connection();
  const searchParams = await props.searchParams;
  const raw: string | string[] | undefined = searchParams[DEVICE_VERIFICATION_USER_CODE_PARAM];
  const user_code: string | null = typeof raw === "string" ? normalizeUserCode(raw) : null;
  const next_href: string =
    user_code === null
      ? DEVICE_VERIFICATION_PATH
      : `${DEVICE_VERIFICATION_PATH}?${new URLSearchParams({
          [DEVICE_VERIFICATION_USER_CODE_PARAM]: formatUserCode(user_code),
        }).toString()}`;

  return await withAuthenticatedServerComponentRouteGuard(
    async ({ user }: IProtectedAuthenticatedServerComponentPageProps): Promise<ReactElement> => {
      if (!user) {
        // allow typescript to see that user data is set
        throw new Error(
          "This should be unreachable code-- redirectWithError seems to not have worked!",
        );
      }
      return <DeviceVerificationPageView initial_user_code={user_code} />;
    },
    { next_href },
  );
}

export const runtime: ServerRuntime = "nodejs";
