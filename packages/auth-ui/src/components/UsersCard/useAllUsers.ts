"use client";

import useSWR, { type SWRResponse } from "swr";
import { userDataSchema, type UserData } from "@schemavaults/auth-common";

export const listAllUsersEndpoint = "/api/admin/users/list";

export interface UseAllUsersOptions {
  preloaded?: readonly UserData[];
}

/**
 * Lists every registered user via the admin-only users list endpoint.
 * Callers must only mount this for global administrators; other sessions
 * receive a 403 and the hook surfaces it as an error.
 */
export function useAllUsers({
  preloaded,
}: UseAllUsersOptions = {}): SWRResponse<readonly UserData[], Error> {
  return useSWR(
    listAllUsersEndpoint,
    async (): Promise<readonly UserData[]> => {
      try {
        const response = await fetch(listAllUsersEndpoint, {
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

        const users: readonly UserData[] = parsed_users.data;
        return users;
      } catch (e: unknown) {
        console.error(`Failed to list users: `, e);
        throw new Error(`Failed to list users!`);
      }
    },
    {
      fallbackData: preloaded,
    },
  );
}

export default useAllUsers;
