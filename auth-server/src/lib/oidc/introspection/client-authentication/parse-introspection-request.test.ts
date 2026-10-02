import { describe, expect, test } from "bun:test";
import { parseIntrospectionRequest } from "./parse-introspection-request";

const ENDPOINT = "https://auth.example.com/api/oidc/introspect" as const;
const APP_ID = "22222222-2222-4222-8222-222222222222" as const;
const API_SERVER_ID = "4f7c2f4e-9d6a-4a1b-8f3e-2c5d6e7f8a9b" as const;
const JWT_BEARER =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer" as const;

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

async function expectError(
  request: Request,
  error: "invalid_request" | "invalid_client",
  error_description: string,
): Promise<void> {
  expect(await parseIntrospectionRequest(request)).toEqual({
    ok: false,
    error: { error, error_description },
  });
}

describe("parseIntrospectionRequest", () => {
  test("refuses a body that is not form-encoded", async () => {
    await expectError(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "t" }),
      }),
      "invalid_request",
      "Request body must be application/x-www-form-urlencoded.",
    );
  });

  test("requires `token`, before anything else", async () => {
    await expectError(
      formRequest({}, { Authorization: "Basic !!!" }),
      "invalid_request",
      "Missing 'token' parameter.",
    );
  });

  test("refuses a malformed Basic header", async () => {
    await expectError(
      formRequest({ token: "t" }, { Authorization: "Basic bm8tY29sb24" }),
      "invalid_request",
      "Malformed Basic Authorization header.",
    );
  });

  test("refuses a request identifying no client", async () => {
    await expectError(
      formRequest({ token: "t" }),
      "invalid_client",
      "Client authentication is required to introspect tokens (client_secret_basic, client_secret_post or private_key_jwt).",
    );
  });

  test("refuses a malformed client_id", async () => {
    await expectError(
      formRequest({ token: "t", client_id: "Not An App Id!" }),
      "invalid_request",
      "Malformed 'client_id' parameter.",
    );
  });

  describe("client_secret", () => {
    test("reads client_secret_basic, client_id from the header", async () => {
      expect(
        await parseIntrospectionRequest(
          formRequest({ token: "t" }, { Authorization: basic(APP_ID, "s3cret") }),
        ),
      ).toEqual({
        ok: true,
        request: {
          token: "t",
          credentials: {
            method: "client_secret",
            client_app_id: APP_ID,
            basic_credentials: { client_id: APP_ID, client_secret: "s3cret" },
            post_client_secret: null,
          },
        },
      });
    });

    test("reads client_secret_post", async () => {
      expect(
        await parseIntrospectionRequest(
          formRequest({
            token: "t",
            client_id: APP_ID,
            client_secret: "s3cret",
            token_type_hint: "access_token",
          }),
        ),
      ).toEqual({
        ok: true,
        request: {
          token: "t",
          credentials: {
            method: "client_secret",
            client_app_id: APP_ID,
            basic_credentials: null,
            post_client_secret: "s3cret",
          },
        },
      });
    });
  });

  describe("private_key_jwt", () => {
    test("reads the assertion and the optional client_id", async () => {
      expect(
        await parseIntrospectionRequest(
          formRequest({
            token: "t",
            client_id: API_SERVER_ID,
            client_assertion_type: JWT_BEARER,
            client_assertion: "a.b.c",
          }),
        ),
      ).toEqual({
        ok: true,
        request: {
          token: "t",
          credentials: {
            method: "private_key_jwt",
            client_assertion: "a.b.c",
            client_id: API_SERVER_ID,
          },
        },
      });

      const without_client_id = await parseIntrospectionRequest(
        formRequest({
          token: "t",
          client_assertion_type: JWT_BEARER,
          client_assertion: "a.b.c",
        }),
      );
      expect(
        without_client_id.ok && without_client_id.request.credentials,
      ).toEqual({
        method: "private_key_jwt",
        client_assertion: "a.b.c",
        client_id: null,
      });
    });

    test("refuses a client secret alongside the assertion", async () => {
      const multiple =
        "Multiple client authentication methods used; send either a client secret or a client assertion, not both.";
      await expectError(
        formRequest(
          { token: "t", client_assertion_type: JWT_BEARER, client_assertion: "a.b.c" },
          { Authorization: basic(APP_ID, "s3cret") },
        ),
        "invalid_request",
        multiple,
      );
      await expectError(
        formRequest({
          token: "t",
          client_secret: "s3cret",
          client_assertion_type: JWT_BEARER,
          client_assertion: "a.b.c",
        }),
        "invalid_request",
        multiple,
      );
    });

    test("refuses an unsupported or missing client_assertion_type", async () => {
      const unsupported = `Unsupported 'client_assertion_type'; expected '${JWT_BEARER}'.`;
      await expectError(
        formRequest({
          token: "t",
          client_assertion_type: "urn:example:other",
          client_assertion: "a.b.c",
        }),
        "invalid_request",
        unsupported,
      );
      await expectError(
        formRequest({ token: "t", client_assertion: "a.b.c" }),
        "invalid_request",
        unsupported,
      );
    });

    test("refuses a missing client_assertion", async () => {
      await expectError(
        formRequest({ token: "t", client_assertion_type: JWT_BEARER }),
        "invalid_request",
        "Missing 'client_assertion' parameter.",
      );
    });
  });
});
