import "server-only";

import {
  type AuthenticationOutcomeType,
  authenticationOutcomeTypeSchema,
} from "@/lib/authentication_outcome_type";
import { type ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AuthenticateResult } from "@schemavaults/auth-common";
import { handleLogin } from "./handle_login";
import { handleRegister } from "./handle_register";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

// /api/auth/[authentication_type]
const authenticatePOSTparams = z
  .object({
    authentication_type: authenticationOutcomeTypeSchema,
  })
  .required({
    authentication_type: true,
  })
  .strict();

export type AuthenticatePOSTparams = z.infer<typeof authenticatePOSTparams>;

export async function POST(
  req: NextRequest,
  input: { params: Promise<{ authentication_type: string }> },
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const parsed_params = await authenticatePOSTparams.safeParseAsync(
    await input.params,
  );

  if (!parsed_params.success) {
    // Failed to parse params
    return NextResponse.json(parsed_params.error, { status: 400 });
  }
  // Still have to validate body

  // Ensure body is valid JSON
  let body_json: unknown;
  try {
    body_json = await req.json();
  } catch (e: unknown) {
    if (environment === "development") {
      console.error(e);
    }
    return NextResponse.json(
      {
        success: false,
        message: "Invalid body JSON",
      } satisfies AuthenticateResult,
      {
        status: 400,
      },
    );
  }

  try {
    const authentication_type: AuthenticationOutcomeType =
      parsed_params.data.authentication_type;
    console.log(
      "[/api/auth/[authentication_type] Running with authentication_type: ",
      authentication_type,
    );
    switch (authentication_type) {
      case "login":
        return await handleLogin({ body: body_json });

      case "register":
        return await handleRegister({ body: body_json });

      case "reset-password":
        // Handle reset password
        return NextResponse.json(
          {
            success: false,
            message: "Password reset not implemented",
          } satisfies AuthenticateResult,
          {
            status: 501,
          },
        );

      default:
        if (environment === "development") {
          console.error(`Invalid authentication type: ${authentication_type}`);
        }
        return NextResponse.json(
          {
            success: false,
            message: "Invalid authentication type",
          } satisfies AuthenticateResult,
          {
            status: 400,
          },
        );
    }
  } catch (e: unknown) {
    console.error(
      "Internal server error attempting to handle /api/auth/[authentication_type] request",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      } satisfies AuthenticateResult,
      {
        status: 500,
      },
    );
  }
}

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";
