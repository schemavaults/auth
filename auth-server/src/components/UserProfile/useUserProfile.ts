"use client";

import useSWR, { type SWRResponse } from "swr";
import {
  userProfileResponseSchema,
  type UserProfileNames,
} from "@schemavaults/auth-common";

export const USER_PROFILE_ENDPOINT = "/api/user/profile";

export interface UseUserProfileOptions {
  /**
   * SSR-preloaded profile (from the account page's server component) so
   * the card renders populated on first paint instead of waiting for
   * the client-side fetch.
   */
  initialData?: UserProfileNames;
}

/**
 * Fetches the current user's profile name fields from the auth server.
 * The token payload does not carry these fields, so they always come
 * from GET /api/user/profile (backed by the USERS row).
 */
export function useUserProfile(
  options?: UseUserProfileOptions,
): SWRResponse<UserProfileNames, Error> {
  return useSWR<UserProfileNames, Error>(
    USER_PROFILE_ENDPOINT,
    async (): Promise<UserProfileNames> => {
      const response = await fetch(USER_PROFILE_ENDPOINT, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok || response.status !== 200) {
        throw new Error(
          `Failed to load user profile (status: ${response.status})`,
        );
      }

      const body: unknown = await response.json();
      const parsed = userProfileResponseSchema.safeParse(body);
      if (!parsed.success) {
        console.error("Failed to parse user profile response:", parsed.error);
        throw new Error("Failed to parse user profile from response");
      }

      return parsed.data.profile;
    },
    {
      fallbackData: options?.initialData,
    },
  );
}

export default useUserProfile;
