"use client";

import useSWR, { type SWRResponse } from "swr";
import { userDataSchema, type UserData } from "@schemavaults/auth-common";

export const LIST_ALL_USERS_ENDPOINT = "/api/admin/users/list";

export interface UseAllUsersListOptions {
  /**
   * SSR-preloaded users, used as SWR `fallbackData` so tables, counts and
   * charts render on first paint.
   */
  initialData?: readonly UserData[] | undefined;
}

async function listAllUsers(): Promise<readonly UserData[]> {
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

    const usersWithSub = body.data.users.map(
      (user: Record<string, unknown>) => ({
        ...user,
        sub: user.uid,
      }),
    );

    const parsed_users = await userDataSchema
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
  return useSWR<readonly UserData[], Error>(
    LIST_ALL_USERS_ENDPOINT,
    listAllUsers,
    {
      fallbackData: initialData ? [...initialData] : undefined,
    },
  );
}

export default useAllUsersList;
