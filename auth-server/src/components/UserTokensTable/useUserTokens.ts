"use client";

import useSWR, { type SWRResponse } from "swr";
import { z } from "zod";
import type {
  IssuedTokenRow,
  IssuedTokenType,
} from "@/lib/auth-db/issued-tokens";

const issuedTokenRowSchema = z.object({
  jti: z.string(),
  uid: z.string(),
  token_type: z.enum(["access", "refresh"]),
  client_app_id: z.string(),
  audience: z.string(),
  grant_type: z.enum(["refresh_token", "authorization_code"]),
  issued_at: z.coerce.number(),
  expires_at: z.coerce.number(),
});

export interface UseUserTokensOptions {
  uid: string;
  tokenType: IssuedTokenType;
}

export function useUserTokens({
  uid,
  tokenType,
}: UseUserTokensOptions): SWRResponse<readonly IssuedTokenRow[], Error> {
  const endpoint = `/api/admin/users/${uid}/tokens?token_type=${tokenType}`;
  return useSWR<readonly IssuedTokenRow[], Error>(
    endpoint,
    async (): Promise<readonly IssuedTokenRow[]> => {
      const response = await fetch(endpoint, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok || response.status !== 200) {
        throw new Error(
          `Failed to list user tokens (status: ${response.status})`,
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
          "Received failure response when attempting to list user tokens",
        );
      }

      if (
        !("data" in body) ||
        typeof body.data !== "object" ||
        !body.data ||
        !("tokens" in body.data) ||
        !Array.isArray(body.data.tokens)
      ) {
        throw new Error("Failed to extract 'tokens' array from response");
      }

      const parsed = z.array(issuedTokenRowSchema).safeParse(body.data.tokens);
      if (!parsed.success) {
        console.error("Failed to parse user tokens:", parsed.error);
        throw new Error("Failed to parse user tokens from response");
      }

      return parsed.data;
    },
  );
}
