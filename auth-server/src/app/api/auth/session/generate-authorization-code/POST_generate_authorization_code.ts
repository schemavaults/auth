import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { generateAuthorizationCode } from "@/lib/auth-db/users/generate-authorization-code";
import { z } from "zod";
import { appIdSchema } from "@schemavaults/app-definitions";
import { codeChallengeSchema } from "@schemavaults/auth-common/pkce/code_challenge.js";
import { isPkceChallengeExpired } from "@schemavaults/auth-common/pkce/is_pkce_challenge_expired.js";

const requestBodySchema = z
  .object({
    client_app_id: appIdSchema,
    code_challenge: codeChallengeSchema,
    code_challenge_method: z.literal("S256"),
    challenge_time: z.number().nonnegative(),
  })
  .required({
    client_app_id: true,
    code_challenge: true,
    code_challenge_method: true,
    challenge_time: true
  })
  .strict();

export async function POST_generate_authorization_code(
  request: NextRequest,
): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
      environment,
    }: IProtectedAuthenticatedApiRouteProps) => {
      if (environment === "development") {
        console.log(
          "[/api/auth/session/generate-authorization-code] POST request received",
        );
      }

      let body: z.infer<typeof requestBodySchema>;
      try {
        const raw = await request.json();
        const parsed = requestBodySchema.safeParse(raw);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, message: "Invalid request body" },
            { status: 400 },
          );
        }
        body = parsed.data;
      } catch {
        return NextResponse.json(
          { success: false, message: "Failed to parse request body" },
          { status: 400 },
        );
      }

      if (isPkceChallengeExpired(body.challenge_time)) {
        return NextResponse.json(
          { success: false, message: "PKCE challenge has expired", error_id: "pkce_challenge_expired" },
          { status: 400 },
        );
      }

      try {
        const authorization_code = await generateAuthorizationCode(
          dbh.db,
          user.uid,
          body.client_app_id,
          body.code_challenge,
          body.code_challenge_method,
          body.challenge_time,
          environment === "development",
        );

        return NextResponse.json({
          success: true,
          authorization_code,
        });
      } catch (e: unknown) {
        console.error(
          "[generate-authorization-code] Failed to generate authorization code:",
          e,
        );
        return NextResponse.json(
          {
            success: false,
            message: "Failed to generate authorization code",
          },
          { status: 500 },
        );
      }
    },
  );
  return await protected_route(request);
}

export default POST_generate_authorization_code;
