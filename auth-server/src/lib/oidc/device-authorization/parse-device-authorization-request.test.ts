import { describe, expect, test } from "bun:test";
import { parseDeviceAuthorizationRequest } from "./parse-device-authorization-request";

const ENDPOINT = "https://auth.example.com/api/oidc/device_authorization" as const;
const APP_ID = "22222222-2222-4222-8222-222222222222" as const;
const OTHER_APP_ID = "33333333-3333-4333-8333-333333333333" as const;

function basic(client_id: string, client_secret: string): string {
  return `Basic ${Buffer.from(
    `${encodeURIComponent(client_id)}:${encodeURIComponent(client_secret)}`,
  ).toString("base64")}`;
}

function formRequest(
  form: Record<string, string>,
  headers: Record<string, string> = {},
): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(form).toString(),
  });
}

describe("parseDeviceAuthorizationRequest", () => {
  test("reads a public client's client_id, scope and resource", async () => {
    const parsed = await parseDeviceAuthorizationRequest(
      formRequest({ client_id: APP_ID, scope: "openid email", resource: APP_ID }),
      "test",
    );
    expect(parsed).toEqual({
      ok: true,
      request: {
        client_app_id: APP_ID,
        basic_credentials: null,
        post_client_secret: null,
        scope: "openid email",
        resource: APP_ID,
      },
    });
  });

  test("takes the client_id from the Basic credentials when the form omits it", async () => {
    const parsed = await parseDeviceAuthorizationRequest(
      formRequest({}, { Authorization: basic(APP_ID, "s3cret") }),
      "test",
    );
    expect(parsed.ok && parsed.request.client_app_id).toBe(APP_ID);
  });

  test("accepts a client_id in both places when they name the same client", async () => {
    const parsed = await parseDeviceAuthorizationRequest(
      formRequest({ client_id: APP_ID }, { Authorization: basic(APP_ID, "s3cret") }),
      "test",
    );
    expect(parsed.ok && parsed.request.client_app_id).toBe(APP_ID);
    expect(parsed.ok && parsed.request.basic_credentials).toEqual({
      client_id: APP_ID,
      client_secret: "s3cret",
    });
  });

  test("refuses a form client_id that differs from the Basic credentials' one", async () => {
    expect(
      await parseDeviceAuthorizationRequest(
        formRequest({ client_id: APP_ID }, { Authorization: basic(OTHER_APP_ID, "s3cret") }),
        "test",
      ),
    ).toEqual({
      ok: false,
      error: {
        error: "invalid_client",
        error_description:
          "The Authorization header credentials do not match the request's client_id.",
      },
    });
  });

  test("compares the client_ids exactly, so case does not make them match", async () => {
    const parsed = await parseDeviceAuthorizationRequest(
      formRequest({ client_id: "my-cli" }, { Authorization: basic("My-CLI", "s3cret") }),
      "test",
    );
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error.error).toBe("invalid_client");
  });

  test("refuses a missing client_id, a malformed Basic header and a malformed scope", async () => {
    const missing = await parseDeviceAuthorizationRequest(formRequest({}), "test");
    expect(!missing.ok && missing.error.error).toBe("invalid_client");

    const malformed = await parseDeviceAuthorizationRequest(
      formRequest({ client_id: APP_ID }, { Authorization: "Basic !!!" }),
      "test",
    );
    expect(!malformed.ok && malformed.error.error).toBe("invalid_request");

    const scope = await parseDeviceAuthorizationRequest(
      formRequest({ client_id: APP_ID, scope: 'open"id' }),
      "test",
    );
    expect(!scope.ok && scope.error.error).toBe("invalid_scope");
  });
});
