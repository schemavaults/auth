"use client";

import useSWR, { type SWRResponse } from "swr";
import type { AppId } from "@schemavaults/app-definitions";
import {
  createUserDataSchema,
  formatOidcSubClaim,
  type UserData,
} from "@schemavaults/auth-common";
import { useAuthServerAppId } from "@schemavaults/auth-react-provider";

export const LIST_ALL_USERS_ENDPOINT = "/api/admin/users/list";

export interface UseAllUsersListOptions {
  /**
   * SSR-preloaded users, used as SWR `fallbackData` so tables, counts and
   * charts render on first paint.
   */
  initialData?: readonly UserData[] | undefined;
}

async function listAllUsers(
  auth_server_app_id: AppId,
): Promise<readonly UserData[]> {
  try {
    const response = await fetch(LIST_ALL_USERS_ENDPOINT, {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok || response.status !== 200) {
      throw new Error(
        `Failed to list users (response status: ${response.status})!`,
      );
    }
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      !body ||
      !("success" in body) ||
      !body.success
    ) {
      throw new Error(
        "Received failure response when attempting to list users",
      );
    }
    if (
      !("data" in body) ||
      typeof body.data !== "object" ||
      !body.data ||
      !("users" in body.data) ||
      !Array.isArray(body.data.users)
    ) {
      throw new Error("Failed to extract 'users' array from response!");
    }

    // The list endpoint returns stored users: no `sub` (UserData.sub is the
    // OIDC subject `<auth_server_app_id>|<uid>`), and the owning app id of a
    // service account rather than UserData's `service_account` flag.
    const usersWithSub = body.data.users.map(
      ({
        service_account_app_id,
        ...user
      }: Record<string, unknown>) => ({
        ...user,
        ...(typeof service_account_app_id === "string"
          ? { service_account: true }
          : {}),
        sub:
          typeof user.uid === "string" && user.uid.length > 0
            ? formatOidcSubClaim(auth_server_app_id, user.uid)
            : user.uid,
      }),
    );

    const parsed_users = await createUserDataSchema({ auth_server_app_id })
      .array()
      .safeParseAsync(usersWithSub);

    if (!parsed_users.success) {
      console.error(
        `Failed to parse 'users' from response object: `,
        parsed_users.error,
      );
      throw new Error("Failed to parse 'users' from response object!");
    }

    return parsed_users.data;
  } catch (e: unknown) {
    console.error(`Failed to list users: `, e);
    throw new Error(`Failed to list users!`);
  }
}

/**
 * @description Lists every registered user from the admin-only list
 * endpoint. Every consumer shares the same SWR key, so the users table, the
 * stat cards and the charts on `/admin/users` are served by a single
 * request.
 */
export function useAllUsersList(
  { initialData }: UseAllUsersListOptions = {},
): SWRResponse<readonly UserData[], Error> {
  const auth_server_app_id: AppId = useAuthServerAppId();
  return useSWR<readonly UserData[], Error>(
    LIST_ALL_USERS_ENDPOINT,
    () => listAllUsers(auth_server_app_id),
    {
      fallbackData: initialData ? [...initialData] : undefined,
    },
  );
}

export default useAllUsersList;
