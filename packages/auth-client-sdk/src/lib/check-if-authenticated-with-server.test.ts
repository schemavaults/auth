import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import checkIfAuthenticatedWithServer from "./check-if-authenticated-with-server";
import { WhoamiRequestFailedError } from "./whoami-request-failed-error";

const AUTH_SERVER = "https://auth.example.com";
const CLIENT_APP_ID = "my-web-app";
const UID = "0b5b6c3e-8a4f-4f1e-9d2a-3c4b5a6d7e8f";
const USER = {
  uid: UID,
  sub: UID,
  email: "someone@example.com",
  created_at: 1_700_000_000_000,
};

function adapterFetching(fetch: () => Promise<Response>): ISchemaVaultsAuthClientAdapter {
  return {
    fetch,
    hasRefreshToken: (): boolean => true,
    doesSupportHttpOnlyRefreshToken: (): boolean => true,
  } as unknown as ISchemaVaultsAuthClientAdapter;
}

function check(fetch: () => Promise<Response>) {
  return checkIfAuthenticatedWithServer({
    auth_server_uri: AUTH_SERVER,
    adapter: adapterFetching(fetch),
    client_app_id: CLIENT_APP_ID,
    auth_server_app_id: "schemavaults",
  });
}

function respond(status: number, body: string, content_type: string = "application/json") {
  return async (): Promise<Response> => new Response(body, { status, headers: { "Content-Type": content_type } });
}

/** The error `promise` rejects with, asserted to be a WhoamiRequestFailedError. */
async function failureOf(promise: Promise<unknown>): Promise<WhoamiRequestFailedError> {
  try {
    await promise;
  } catch (e: unknown) {
    expect(e).toBeInstanceOf(WhoamiRequestFailedError);
    const error = e as WhoamiRequestFailedError;
    expect(error.message.startsWith("Failed to load current user data from whoami API: ")).toBe(true);
    return error;
  }
  throw new Error("expected the whoami check to fail");
}

describe("checkIfAuthenticatedWithServer", () => {
  let consoleError: Mock<typeof console.error>;
  beforeEach(() => {
    consoleError = spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  test("returns the parsed user", async () => {
    const user = await check(respond(200, JSON.stringify({ success: true, user: USER })));
    expect(user?.uid).toBe(UID);
    expect(user?.sub).toBe(`schemavaults|${UID}`);
  });

  test("resolves to null when the server does not recognize the session", async () => {
    expect(await check(respond(401, JSON.stringify({ success: false, error: true, message: "Unauthorized" })))).toBeNull();
    expect(await check(respond(403, ""))).toBeNull();
  });

  test("names a network error and hints at CORS", async () => {
    const cause = new TypeError("Failed to fetch");
    const error = await failureOf(
      check(async () => {
        throw cause;
      }),
    );
    expect(error.reason).toBe("network");
    expect(error.status).toBeNull();
    expect(error.cause).toBe(cause);
    expect(error.message).toContain(`no response from GET ${AUTH_SERVER}/api/auth/whoami/${CLIENT_APP_ID}`);
    expect(error.message).toContain("TypeError: Failed to fetch");
    expect(error.message).toContain(`registered as a domain of client app '${CLIENT_APP_ID}'`);
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  test("repeats the status and the server's message of an error response", async () => {
    const error = await failureOf(
      check(respond(500, JSON.stringify({ success: false, error: true, message: "Internal server error" }))),
    );
    expect(error.reason).toBe("http_status");
    expect(error.status).toBe(500);
    expect(error.message).toContain("the auth server answered HTTP 500");
    expect(error.message).toContain(": Internal server error");
  });

  test("describes a non-JSON error response by its content type", async () => {
    const error = await failureOf(check(respond(502, "<html><body>Bad Gateway</body></html>", "text/html")));
    expect(error.reason).toBe("http_status");
    expect(error.status).toBe(502);
    expect(error.message).toContain("HTTP 502");
    expect(error.message).toContain("with a non-JSON body (text/html)");
  });

  test("says when a successful response is not JSON", async () => {
    const html = await failureOf(check(respond(200, "<!doctype html><title>Sign in</title>", "text/html")));
    expect(html.reason).toBe("invalid_json");
    expect(html.status).toBe(200);
    expect(html.message).toContain("the HTTP 200 response is not valid JSON (text/html");
    expect(html.cause).toBeInstanceOf(SyntaxError);

    const empty = await failureOf(check(respond(200, "")));
    expect(empty.reason).toBe("invalid_json");
    expect(empty.message).toContain("the HTTP 200 response body is empty");
  });

  test("says what is missing from an unexpected response", async () => {
    const not_object = await failureOf(check(respond(200, JSON.stringify([USER]))));
    expect(not_object.reason).toBe("unexpected_response");
    expect(not_object.message).toContain("got an array");

    const not_success = await failureOf(
      check(respond(200, JSON.stringify({ success: false, message: "Session not found" }))),
    );
    expect(not_success.reason).toBe("unexpected_response");
    expect(not_success.message).toContain("success=false");
    expect(not_success.message).toContain("Session not found");

    const no_user = await failureOf(check(respond(200, JSON.stringify({ success: true }))));
    expect(no_user.reason).toBe("unexpected_response");
    expect(no_user.message).toContain("no 'user' object");
  });

  test("lists the schema issues of invalid user data without echoing its values", async () => {
    const error = await failureOf(
      check(
        respond(
          200,
          JSON.stringify({
            success: true,
            user: { ...USER, email: "not-an-email", favorite_color: "teal" },
          }),
        ),
      ),
    );
    expect(error.reason).toBe("invalid_user_data");
    expect(error.status).toBe(200);
    expect(error.message).toContain("email: ");
    expect(error.message).toContain("favorite_color");
    expect(error.message).toContain("@schemavaults/auth-client-sdk@");
    expect(error.message).not.toContain("not-an-email");
    expect(error.message).not.toContain("teal");
    expect(error.cause).toBeDefined();
  });
});
