import "server-only";
import { z } from "zod";
import type {
  ApiServerId,
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { createAudienceSchema } from "@schemavaults/auth-common";
import type { ServerlessDatabase } from "@/lib/auth-db";
import { resolveTokenAudience } from "@/lib/oidc/resolve-token-audience";
import { isClientAppPermittedForApiServer } from "@/lib/validate-audience";
import UnresolvableTokenResourceError from "@/lib/error/UnresolvableTokenResourceError";

export interface ResolvedGrantResource {
  /** The `resource` exactly as the client sent it. */
  resource: string;
  /** The API server it resolved to, whose API scopes the grant may hold. */
  api_server_id: ApiServerId;
}

export interface ResolveGrantResourceOptions {
  dbh: ServerlessDatabase;
  client_app_id: AppId;
  /**
   * The RFC 8707 `resource` value(s) of the authorization request (the
   * authorize endpoint's query, or the login flow's `resource` field).
   */
  resource: string | readonly string[] | null | undefined;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

/**
 * Resolves the RFC 8707 `resource` of an AUTHORIZATION request to the API
 * server whose API scopes the grant may hold: a single value naming an API
 * server (by id or by the URL of one of its registered domains) that this
 * client may get tokens for, by the same app-to-API connection rules the
 * token endpoint applies.
 *
 * Returns null — the grant then holds OIDC scopes only, exactly as before
 * authorization requests could bind a resource — for an absent value,
 * several values, a malformed or unknown resource, the auth server itself,
 * or an API server the client may not use. Lenient on purpose: the
 * authorization endpoint ignored `resource` before, so a value it now
 * cannot honour must not break a flow that used to work; the token
 * endpoint still refuses such a value with `invalid_target`.
 */
export async function resolveGrantResource({
  dbh,
  client_app_id,
  resource,
  environment,
  debug = false,
}: ResolveGrantResourceOptions): Promise<ResolvedGrantResource | null> {
  const values: string[] = (
    typeof resource === "string" ? [resource] : [...(resource ?? [])]
  ).filter((value) => typeof value === "string" && value.length > 0);
  if (values.length !== 1) {
    if (debug && values.length > 1) {
      console.log(
        `[resolveGrantResource] Ignoring ${values.length} 'resource' values for '${client_app_id}': API scopes are bound to a single resource`,
      );
    }
    return null;
  }
  const value: string = values[0]!;
  if (!createAudienceSchema(z, environment).safeParse(value).success) {
    return null;
  }

  let api_server_id: ApiServerId;
  try {
    const resolved = await resolveTokenAudience(dbh.db, value, environment, debug);
    if (resolved.kind === "auth-server") {
      // The auth server defines no API scopes.
      return null;
    }
    api_server_id = resolved.api_server_id;
  } catch (e: unknown) {
    if (e instanceof UnresolvableTokenResourceError || e instanceof TypeError) {
      if (debug) {
        console.log(
          `[resolveGrantResource] Ignoring unresolvable 'resource' '${value}' for '${client_app_id}'`,
        );
      }
      return null;
    }
    throw e;
  }

  const permitted: boolean = await isClientAppPermittedForApiServer(
    client_app_id,
    api_server_id,
    dbh,
    debug,
  );
  if (!permitted) {
    if (debug) {
      console.log(
        `[resolveGrantResource] Ignoring 'resource' '${value}': client '${client_app_id}' may not use API server '${api_server_id}'`,
      );
    }
    return null;
  }
  return { resource: value, api_server_id };
}

export default resolveGrantResource;
