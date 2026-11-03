import { describe, expect, test } from "bun:test";
import { parseRevocationRequest } from "./parse-revocation-request";

const ENDPOINT = "https://auth.example.com/api/oidc/revoke" as const;
const APP_ID = "22222222-2222-4222-8222-222222222222" as const;

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
  expect(await parseRevocationRequest(request)).toEqual({
    ok: false,
    error: { error, error_description },
  });
}

describe("parseRevocationRequest", () => {
  test("refuses a body that is not form-encoded", async () => {
    await expectError(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "t", client_id: APP_ID }),
      }),
      "invalid_request",
      "Request body must be application/x-www-form-urlencoded.",
    );
  });

  test("requires `token`, before anything else", async () => {
    await expectError(
      formRequest({ client_id: APP_ID }, { Authorization: "Basic !!!" }),
      "invalid_request",
      "Missing 'token' parameter.",
    );
    await expectError(
      formRequest({ token: "", client_id: APP_ID }),
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

  test("refuses a request identifying no client, or a malformed client_id", async () => {
    const forms: Record<string, string>[] = [
      { token: "t" },
      { token: "t", client_id: "not an app id!" },
    ];
    for (const form of forms) {
      await expectError(
        formRequest(form),
        "invalid_client",
        "Missing or malformed 'client_id' parameter.",
      );
    }
  });

  test("a public client identifies itself with client_id alone", async () => {
    expect(
      await parseRevocationRequest(
        formRequest({ token: "t", client_id: APP_ID, token_type_hint: "refresh_token" }),
      ),
    ).toEqual({
      ok: true,
      request: {
        token: "t",
        client_app_id: APP_ID,
        basic_credentials: null,
        post_client_secret: null,
      },
    });
  });

  test("client_secret_basic may carry the client_id by itself", async () => {
    expect(
      await parseRevocationRequest(
        formRequest({ token: "t" }, { Authorization: basic(APP_ID, "s3cret") }),
      ),
    ).toEqual({
      ok: true,
      request: {
        token: "t",
        client_app_id: APP_ID,
        basic_credentials: { client_id: APP_ID, client_secret: "s3cret" },
        post_client_secret: null,
      },
    });
  });

  test("reads client_secret_post, and the form's client_id wins over the Basic one", async () => {
    expect(
      await parseRevocationRequest(
        formRequest({ token: "t", client_id: APP_ID, client_secret: "s3cret" }),
      ),
    ).toEqual({
      ok: true,
      request: {
        token: "t",
        client_app_id: APP_ID,
        basic_credentials: null,
        post_client_secret: "s3cret",
      },
    });
    // A disagreeing Basic client_id is left for authentication to refuse.
    const other = "33333333-3333-4333-8333-333333333333";
    const parsed = await parseRevocationRequest(
      formRequest({ token: "t", client_id: APP_ID }, { Authorization: basic(other, "x") }),
    );
    expect(parsed.ok && parsed.request.client_app_id).toBe(APP_ID);
  });

  test("ignores an unknown token_type_hint", async () => {
    const parsed = await parseRevocationRequest(
      formRequest({ token: "t", client_id: APP_ID, token_type_hint: "saml2-bearer" }),
    );
    expect(parsed.ok).toBe(true);
  });
});
