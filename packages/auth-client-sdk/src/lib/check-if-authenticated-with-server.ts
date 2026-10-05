import { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { AppId } from "@schemavaults/app-definitions";
import { createUserDataSchema, UserData } from "@schemavaults/auth-common";
import { AUTH_CLIENT_SDK_VERSION } from "@/generated/version";
import {
  WhoamiRequestFailedError,
  type WhoamiRequestFailureReason,
} from "@/lib/whoami-request-failed-error";

export interface ICheckIfAuthenticatedWithServerOpts {
  auth_server_uri: string;
  adapter: ISchemaVaultsAuthClientAdapter;
  client_app_id: string;
  /**
   * Prefixes a bare-uuid `sub` from an older auth server, which predates
   * `UserData.sub` being the OIDC subject `<auth_server_app_id>|<uid>`.
   */
  auth_server_app_id: AppId;
}

/** How much of a server-provided error message the thrown error repeats. */
const MAX_SERVER_MESSAGE_LENGTH: number = 200;

/** How many schema issues the thrown error lists. */
const MAX_LISTED_ISSUES: number = 5;

function truncate(value: string, max_length: number): string {
  return value.length <= max_length ? value : `${value.slice(0, max_length - 1)}…`;
}

function describeThrown(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

/** The error message an auth server (or proxy) JSON error body carries, if any. */
function serverMessageOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  for (const key of ["message", "error_description", "error"] as const) {
    const value: unknown = (body as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      return truncate(value.trim(), MAX_SERVER_MESSAGE_LENGTH);
    }
  }
  return null;
}

function contentTypeOf(response: Response): string {
  return response.headers.get("content-type") ?? "no content-type";
}

/** `path: message` for the first few schema issues (zod messages never echo the input). */
function describeIssues(
  issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>,
): string {
  const listed: string[] = issues
    .slice(0, MAX_LISTED_ISSUES)
    .map(
      (issue) =>
        `${issue.path.length > 0 ? issue.path.map(String).join(".") : "user"}: ${issue.message}`,
    );
  const more: number = issues.length - listed.length;
  return listed.join("; ") + (more > 0 ? `; and ${more} more` : "");
}

/** The origin of the current page, in browsers. */
function currentOrigin(): string | null {
  const origin: unknown = (globalThis as { location?: { origin?: unknown } })
    .location?.origin;
  return typeof origin === "string" && origin !== "null" ? origin : null;
}

export default async function checkIfAuthenticatedWithServer({
  auth_server_uri,
  adapter,
  client_app_id,
  auth_server_app_id,
}: ICheckIfAuthenticatedWithServerOpts): Promise<UserData | null> {
  const supportsHttpOnlyCookies: boolean =
    typeof adapter.doesSupportHttpOnlyRefreshToken === "function" &&
    adapter.doesSupportHttpOnlyRefreshToken();

  if (!adapter.hasRefreshToken()) {
    return null;
  }

  const headers = new Headers();
  if (!supportsHttpOnlyCookies) {
    const token: string | undefined = adapter.getRefreshToken()?.token;
    if (!token) {
      return null;
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url: string = new URL(
    `/api/auth/whoami/${client_app_id}`,
    auth_server_uri,
  ).toString();

  function failure(
    reason: WhoamiRequestFailureReason,
    detail: string,
    options: { status?: number | null; cause?: unknown } = {},
  ): WhoamiRequestFailedError {
    const error = new WhoamiRequestFailedError(reason, detail, options);
    console.error(error);
    return error;
  }

  let response: Response;
  try {
    response = await adapter.fetch(url, {
      method: "GET",
      credentials: "include",
      headers,
    });
  } catch (e: unknown) {
    const origin: string | null = currentOrigin();
    throw failure(
      "network",
      `network error, no response from GET ${url} (${describeThrown(e)}). ` +
        "The client may be offline or the auth server unreachable; in a browser this is also how a CORS " +
        `refusal looks: check the console for a CORS error and that ${
          origin ? `this page's origin (${origin})` : "the calling origin"
        } is registered as a domain of client app '${client_app_id}'`,
      { cause: e },
    );
  }

  const status: number = response.status;
  if (status === 401 || status === 403) {
    return null;
  }

  let text: string;
  try {
    text = await response.text();
  } catch (e: unknown) {
    throw failure(
      "network",
      `the connection failed while reading the HTTP ${status} response body (${describeThrown(e)})`,
      { status, cause: e },
    );
  }

  if (!response.ok) {
    let server_message: string | null = null;
    try {
      server_message = serverMessageOf(JSON.parse(text));
    } catch {
      // Not JSON (e.g. a proxy's HTML error page): described by content type.
    }
    const status_line: string = `HTTP ${status}${response.statusText ? ` ${response.statusText}` : ""}`;
    throw failure(
      "http_status",
      `the auth server answered ${status_line}` +
        (server_message
          ? `: ${server_message}`
          : text.trim()
            ? ` with a non-JSON body (${contentTypeOf(response)})`
            : " with an empty body"),
      { status },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (e: unknown) {
    throw failure(
      "invalid_json",
      text.trim()
        ? `the HTTP ${status} response is not valid JSON (${contentTypeOf(response)})`
        : `the HTTP ${status} response body is empty`,
      { status, cause: e },
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw failure(
      "unexpected_response",
      `expected a { success: true, user } object, got ${
        body === null ? "null" : Array.isArray(body) ? "an array" : `a ${typeof body}`
      }`,
      { status },
    );
  }
  if (!("success" in body) || body.success !== true) {
    const server_message: string | null = serverMessageOf(body);
    throw failure(
      "unexpected_response",
      `the response does not have success=true (success=${
        "success" in body ? JSON.stringify(body.success) : "missing"
      })${server_message ? `: ${server_message}` : ""}`,
      { status },
    );
  }
  if (!("user" in body) || typeof body.user !== "object" || body.user === null) {
    throw failure("unexpected_response", "the response has no 'user' object", {
      status,
    });
  }

  const parsed_user = await createUserDataSchema({
    auth_server_app_id,
  }).safeParseAsync(body.user);
  if (!parsed_user.success) {
    throw failure(
      "invalid_user_data",
      `the 'user' in the response failed validation (${describeIssues(parsed_user.error.issues)}). ` +
        `The auth server's UserData shape may differ from the one @schemavaults/auth-client-sdk@${AUTH_CLIENT_SDK_VERSION} expects: ` +
        "upgrade the SDK if the auth server is newer",
      { status, cause: parsed_user.error },
    );
  }

  return parsed_user.data;
}
