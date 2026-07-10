import type { NextResponse } from "next/server";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { type AuthenticateResult } from "@schemavaults/auth-common";
import { applyCorsHeaders } from "./applyCorsHeaders";
import {
  type SchemaVaultsCORSEnforcementPolicy,
  isValidCORSEnforcementPolicy,
  SchemaVaultsCORSEnforcementPolicies as policies,
} from "./cors-policies";
import { isAllowedOrigin } from "./isAllowedOrigin";
import {
  type IAllowedOriginsResolver,
  RemoteAllowedOriginsResolver,
} from "./RemoteAllowedOriginsResolver";
import type {
  ISchemaVaultsMiddleware,
  ISchemaVaultsMiddlewareFactory,
  ISchemaVaultsMiddlewareFnInputs,
} from "@/middleware_types";
import { ensureHttpsInProduction } from "./ensureHttpsInProd";
import {
  BaseMiddleware,
  type IBaseMiddlewareInitOptions,
} from "@/middlewares/BaseMiddleware";
import { assertNoOriginSet } from "./assertNoOriginSet";
import { prettyPrintAvailablePolicies } from "./pretty-print-available-policies";

export interface CorsSettings {
  debug?: boolean;
  policy: SchemaVaultsCORSEnforcementPolicy;
  audience: string;
  auth_server_url: string;
  environment?: SchemaVaultsAppEnvironment;
  allowed_origins_resolver?: IAllowedOriginsResolver;
}

interface CorsMiddlewareSettings
  extends CorsSettings, Omit<IBaseMiddlewareInitOptions, "name"> {
  next: ISchemaVaultsMiddleware;
}

class CorsMiddleware extends BaseMiddleware implements ISchemaVaultsMiddleware {
  private readonly policy: SchemaVaultsCORSEnforcementPolicy;
  private readonly audience: string;
  private readonly auth_server_url: string;
  private readonly allowed_origins_resolver: IAllowedOriginsResolver;

  public constructor(settings: CorsMiddlewareSettings) {
    super({
      ...settings,
      next: settings.next,
      name: "CORS Middleware" as const,
    });
    if (!isValidCORSEnforcementPolicy(settings.policy)) {
      throw new Error(
        `CorsMiddleware did not receive a valid CORS policy to enforce! Constructor's 'policy' option should be one of: ${prettyPrintAvailablePolicies()}`,
      );
    }
    this.policy = settings.policy satisfies SchemaVaultsCORSEnforcementPolicy;
    this.audience = settings.audience;
    this.auth_server_url = settings.auth_server_url;
    this.allowed_origins_resolver =
      settings.allowed_origins_resolver ??
      new RemoteAllowedOriginsResolver({
        auth_server_url: settings.auth_server_url,
        debug: settings.debug,
      });
  }

  public async handle({
    req,
    json,
    ...inputs
  }: ISchemaVaultsMiddlewareFnInputs): Promise<NextResponse | Response> {
    const DEBUG: boolean = this.debug;
    const POLICY = this.policy;
    const audience = this.audience;
    if (DEBUG) {
      console.log("[CorsMiddleware] Running on URL: ", req.url);
      console.log("[CorsMiddleware] nextURL: ", req.nextUrl);
      console.log("[CorsMiddleware] Request Method: ", req.method);
      console.log("[CorsMiddleware] Headers: ", req.headers.entries());
    }

    const origin: string | null | undefined =
      req.headers.get("origin") ?? req.headers.get("Origin");
    const isOriginSet: boolean =
      typeof origin === "string" && origin.length > 0;
    const isPreflight: boolean = req.method === "OPTIONS";

    const isAllowed: boolean = await isAllowedOrigin({
      origin,
      policy: POLICY satisfies SchemaVaultsCORSEnforcementPolicy,
      audience,
      debug: DEBUG,
      environment: this.environment,
      auth_server_url: this.auth_server_url,
      allowed_origins_resolver: this.allowed_origins_resolver,
    });
    if (DEBUG) {
      console.log(
        `[withCorsSettings] ${isOriginSet ? "An" : "No"} origin is set. ${isOriginSet ? `Origin "${origin}"` : "Not having an origin"} ${isAllowed ? "is" : "is not"} allowed for audience "${audience}"`,
      );
    }

    if (!isAllowed) {
      if (DEBUG) {
        console.log("[CorsMiddleware] Origin not allowed, returning 403");
      }
      return json(
        {
          kind: "failure",
          message: "Origin not allowed",
          success: false,
        } satisfies AuthenticateResult,
        { status: 403 },
      );
    } // isAllowed = true

    if (isPreflight) {
      if (DEBUG) {
        console.log(
          "[withCorsSettings] Handling preflight OPTIONS response...",
        );
      }
      console.assert(!!isAllowed);

      let preflightResponseHeaders: Record<string, string>;
      try {
        preflightResponseHeaders = applyCorsHeaders({
          origin,
          headers: {} satisfies Record<string, string>,
          policy: POLICY,
          preflight: isPreflight satisfies true,
          method: req.method,
          allowed: isAllowed,
          debug: DEBUG,
        });
      } catch (e: unknown) {
        console.error(
          "Failed to apply CORS headers for preflight request: ",
          e,
        );
        return json(
          {
            kind: "failure",
            success: false,
            message: "Error applying preflight headers",
          } satisfies AuthenticateResult,
          { status: 500 },
        );
      }
      if (DEBUG) {
        console.log(
          "[withCorsSettings] Assembling preflight OPTIONS response...",
        );
      }

      try {
        const preflightOptionsResponse: Response = json(
          {
            success: true,
            message: "Preflight OK",
          },
          {
            status: 200,
            headers: new Headers(preflightResponseHeaders),
          },
        );
        if (DEBUG) {
          console.log(
            "[withCorsSettings] Returning preflight OPTIONS response...",
          );
        }
        return preflightOptionsResponse;
      } catch (e: unknown) {
        console.error(
          "[withCorsSettings] Failed to return preflight response: ",
          e,
        );
        return json(
          {
            kind: "failure",
            success: false,
            message: "Error building/returning preflight response",
          } satisfies AuthenticateResult,
          { status: 500 },
        );
      }
    } else {
      if (DEBUG) {
        console.log(
          "[withCorsSettings] This is not a preflight request! (the real deal!!!)",
        );
      }
    }

    console.assert(
      !isPreflight,
      "[withCorsSettings] Expected preflight requests to have been handled by this point!",
    );

    if (!origin) {
      if (DEBUG) {
        console.log("[withCorsSettings] No origin header set on request");
      }
      console.assert(
        assertNoOriginSet(origin),
        "Expected request to not contain an origin header if this point was reached!",
      );

      if (req.method !== "GET") {
        if (DEBUG) {
          console.log(
            "[withCorsSettings] No origin header set on request for non-GET method request. Evaluating whether permitted using policy: ",
            POLICY satisfies SchemaVaultsCORSEnforcementPolicy,
          );
        }
        switch (POLICY satisfies SchemaVaultsCORSEnforcementPolicy) {
          case policies.AllowAny:
            console.assert(
              assertNoOriginSet(origin),
              `Expected request to not contain an origin header if this point (non-GET '${policies.AllowAny}' policy evaluator) was reached!`,
            );
            break; // allow.
          case policies.EnforceValidAppIfOriginApplied:
            console.assert(
              assertNoOriginSet(origin),
              `Expected request to not contain an origin header if this point (non-GET '${policies.EnforceValidAppIfOriginApplied}' policy evaluator) was reached!`,
            );
            break; // allow if this policy set -- no origin set
          case policies.SameOriginIfOriginApplied:
            console.assert(
              assertNoOriginSet(origin),
              `Expected request to not contain an origin header if this point (non-GET '${policies.SameOriginIfOriginApplied}' policy evaluator) was reached!`,
            );
            break;
          default:
            throw new Error(
              `Unhandled CORS policy for handling non-GET method request w/o origin header: ${POLICY}`,
            );
        } // end switch(POLICY) statement for handling non-GET requests

        if (DEBUG) {
          console.log(
            `[withCorsSettings] No origin header found for a non-GET request, but policy '${POLICY}' has allowed this!`,
          );
        }
      } else {
        if (DEBUG) {
          console.log(
            "[withCorsSettings] No origin header found, but that's ok for a GET request",
          );
        }
      }
    }

    if (origin) {
      const potentialErrorResponse = ensureHttpsInProduction(req, origin, json);
      if (typeof potentialErrorResponse !== "undefined")
        return potentialErrorResponse;
    }

    if (DEBUG) {
      if (origin) {
        console.log("[withCorsSettings] Request Origin: ", origin);
      } else {
        console.log("[withCorsSettings] No request origin set");
      }
    }

    const next = this.next;
    if (!CorsMiddleware.hasNextMiddleware(next)) {
      throw new Error("Expected CorsMiddleware to have child middleware(s)!");
    }
    const responseWithoutCorsHeaders = await next.handle({
      req,
      json,
      ...inputs,
    });

    // Add CORS headers
    if (responseWithoutCorsHeaders) {
      if (DEBUG) {
        console.log("[withCorsSettings] Applying CORS headers to response.");
      }

      let withCorsHeaders: Record<string, string>;
      try {
        const existingHeaders = responseWithoutCorsHeaders.headers;
        const headers: Record<string, string> = {};
        for (const [key, val] of existingHeaders.entries()) {
          headers[key] = val;
        }

        withCorsHeaders = applyCorsHeaders({
          origin,
          headers,
          policy: POLICY,
          method: req.method,
          preflight: false,
          allowed: isAllowed,
          debug: DEBUG,
        });
      } catch (e: unknown) {
        console.error(
          "[withCorsSettings] Failed to apply CORS headers on final response: ",
          e,
        );
        throw new Error("Failed to apply CORS headers on final response!");
      }

      if (DEBUG) {
        console.log(
          "[withCorsSettings] Applied CORS headers to final response: ",
          withCorsHeaders,
        );
      }

      try {
        return new Response(responseWithoutCorsHeaders.body, {
          headers: new Headers(withCorsHeaders),
          status: responseWithoutCorsHeaders.status,
          statusText: responseWithoutCorsHeaders.statusText,
        });
      } catch (e: unknown) {
        console.error(
          "[withCorsSettings] Failed to generate final 'Response' instance with modified CORS headers: ",
          e,
        );
        return json(
          {
            kind: "failure",
            success: false,
            message: "Error applying preflight headers",
          } satisfies AuthenticateResult,
          { status: 500 },
        );
      }
    } else {
      if (DEBUG) {
        console.log(
          "[withCorsSettings] Not applying CORS headers to response, middleware result was falsy.",
        );
      }
    }

    if (DEBUG) {
      console.log("[CorsMiddleware] Response: ", responseWithoutCorsHeaders);
    }

    return responseWithoutCorsHeaders;
  }
}

export class CorsMiddlewareFactory implements ISchemaVaultsMiddlewareFactory {
  public readonly type = "middleware-factory" as const;

  private readonly middlewareOpts: CorsSettings;

  public constructor(opts: CorsSettings) {
    this.middlewareOpts = opts;
  }

  public create(next: ISchemaVaultsMiddleware): CorsMiddleware {
    return new CorsMiddleware({
      ...this.middlewareOpts,
      next,
    } satisfies CorsMiddlewareSettings);
  }
}
