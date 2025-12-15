import {
  type RequestTokensResult,
  grantTypePOSTbodySchemaMap,
  grant_types,
} from "@schemavaults/auth-common";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRefreshTokenGrant } from "./refresh_token_grant";
import { handleAuthorizationCodeGrant } from "./authorization_code_grant";
import {
  OrganizationsRegistry,
  ServerlessDatabase,
  UserRegistry,
} from "@/lib/auth-db";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";

const invalidGrantTypeMessage: string = `Unsupported grant type, should be one of ${grant_types.join(", ")}`;

/**
 * Acquire a token using an authorization code
 *
 * This endpoint is used to exchange an authorization code for a refresh token and an access token.
 *
 * @param req The incoming request
 * @returns The response
 */
export async function POST(
  req: NextRequest,
  input: { params: Promise<{ grant_type: string }> },
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);
  if (debug) {
    console.log(`${req.method} => /api/token/[grant_type]`);
  }

  const params = await input.params;

  if (typeof params.grant_type !== "string") {
    console.error(
      "Invalid grant type at route '/api/token/[grant_type]'! Not a string!",
    );
    return NextResponse.json(
      {
        success: false,
        message: "Invalid grant type, not a string",
      } satisfies RequestTokensResult,
      {
        status: 400,
      },
    );
  } else if (
    !(grant_types satisfies readonly string[] as readonly string[]).includes(
      params.grant_type,
    )
  ) {
    console.error(invalidGrantTypeMessage);
    return NextResponse.json(
      {
        success: false,
        message: invalidGrantTypeMessage,
      } satisfies RequestTokensResult,
      {
        status: 400,
      },
    );
  }

  if (debug) {
    console.log(`[/api/token/${params.grant_type}] Received POST request`);
  }

  const schema =
    grantTypePOSTbodySchemaMap[
      params.grant_type as (typeof grant_types)[number]
    ];

  // Ensure body is valid JSON
  let body: z.infer<typeof schema>;
  try {
    body = await schema.parseAsync(await req.json());
  } catch (e: unknown) {
    if (debug) {
      console.error("Invalid body JSON: ", e);
    }
    return NextResponse.json(
      {
        success: false,
        message: "Invalid body JSON",
      } satisfies RequestTokensResult,
      {
        status: 400,
      },
    );
  }

  if (body.grant_type !== params.grant_type) {
    console.error("Mismatched grant type");
    return NextResponse.json(
      {
        success: false,
        message: "Mismatched grant type",
      } satisfies RequestTokensResult,
      {
        status: 400,
      },
    );
  }

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  let userRegistry: UserRegistry;
  try {
    userRegistry = new UserRegistry(dbh.db, debug satisfies boolean);
  } catch (e: unknown) {
    console.error("Failed to connect to user registry: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to connect to user registry",
      },
      {
        status: 500,
      },
    );
  }

  let orgRegistry: OrganizationsRegistry;
  try {
    orgRegistry = new OrganizationsRegistry(dbh.db, debug satisfies boolean);
  } catch (e: unknown) {
    console.error("Failed to connect to organizations registry: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to connect to organizations registry",
      },
      {
        status: 500,
      },
    );
  }

  const headers = req.headers;
  const auth_header: string | null = headers.get("Authorization");
  const refresh_token: string =
    typeof auth_header === "string" && auth_header.startsWith("Bearer ")
      ? auth_header.slice("Bearer ".length)
      : "";

  switch (body.grant_type) {
    case "authorization_code":
      return await handleAuthorizationCodeGrant(
        body,
        userRegistry,
        orgRegistry,
        dbh,
        environment satisfies SchemaVaultsAppEnvironment,
        debug satisfies boolean,
      );
    case "refresh_token":
      if (!headers.has("Authorization")) {
        console.error(
          "Missing authorization header for 'refresh_token' grant method!",
        );
        return NextResponse.json(
          {
            success: false,
            message: "Missing Authorization header",
          } satisfies RequestTokensResult,
          {
            status: 401,
          },
        );
      }
      if (
        typeof auth_header !== "string" ||
        !auth_header.startsWith("Bearer ")
      ) {
        console.error(
          "Invalid authorization header for 'refresh_token' grant method!",
        );
        return NextResponse.json(
          {
            success: false,
            message: "Invalid Authorization header",
          } satisfies RequestTokensResult,
          {
            status: 400,
          },
        );
      }

      try {
        return await handleRefreshTokenGrant(
          refresh_token,
          body,
          userRegistry,
          orgRegistry,
          dbh,
          environment satisfies SchemaVaultsAppEnvironment,
          debug satisfies boolean,
        );
      } catch (e: unknown) {
        console.error("Failed to run refresh token grant handler: ", e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to run refresh token grant handler",
          } satisfies RequestTokensResult,
          {
            status: 500,
          },
        );
      }

    default:
      return NextResponse.json(
        {
          success: false,
          message: "Unsupported grant type",
        } satisfies RequestTokensResult,
        {
          status: 400,
        },
      );
  }
}

export const dynamic = "force-dynamic"; // defaults to auto
