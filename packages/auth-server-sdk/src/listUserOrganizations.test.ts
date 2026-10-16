import { beforeAll, describe, expect, test } from "bun:test";
import {
  generateJwtSigningKeyPair,
  importPKCS8,
  importSPKI,
  jwtVerify,
  sign_verify_alg,
} from "@schemavaults/jwt";
import { listUserOrganizations } from "./listUserOrganizations";
import { isUserInOrganization } from "./isUserInOrganization";

const AUTH_SERVER_URL = "https://auth.example.com" as const;
const API_SERVER_ID = "registry-api" as const;
const UID = "11111111-1111-4111-8111-111111111111" as const;
const SUBJECT_TOKEN = "the-users-access-token" as const;

let private_key: CryptoKey;
let public_key: CryptoKey;

beforeAll(async () => {
  const [private_pem, public_pem] = await generateJwtSigningKeyPair();
  private_key = await importPKCS8(private_pem, sign_verify_alg);
  public_key = await importSPKI(public_pem, sign_verify_alg);
});

type FetchInit = Parameters<typeof fetch>[1];

interface CapturedRequest {
  url: string;
  headers: Headers;
}

function stubFetch(
  status: number,
  body: unknown,
): { fetch: typeof fetch; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const stub = (async (input: string | URL | Request, init?: FetchInit) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetch: stub, requests };
}

const MEMBERSHIP = {
  organization_id: "acme",
  organization_name: "Acme",
  role: "owner",
  created_at: 1_700_000_000_000,
  joined_at: 1_700_000_000_001,
} as const;

describe("listUserOrganizations", () => {
  test("authenticates as the API server and forwards the subject token", async () => {
    const { fetch, requests } = stubFetch(200, {
      success: true,
      data: { uid: UID, organization_membership_visibility: "all_organizations", memberships: [MEMBERSHIP] },
    });
    const memberships = await listUserOrganizations({
      auth_server_url: AUTH_SERVER_URL,
      api_server_id: API_SERVER_ID,
      jwks_access_private_key: private_key,
      uid: UID,
      subject_token: SUBJECT_TOKEN,
      fetch,
    });

    expect(memberships).toEqual([MEMBERSHIP]);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request!.url).toBe(`${AUTH_SERVER_URL}/api/resource-server/users/${UID}/organizations`);
    expect(request!.headers.get("x-api-server-id")).toBe(API_SERVER_ID);
    expect(request!.headers.get("x-subject-token")).toBe(SUBJECT_TOKEN);

    const authorization = request!.headers.get("authorization") ?? "";
    expect(authorization.startsWith("Bearer ")).toBe(true);
    const { payload } = await jwtVerify(authorization.slice("Bearer ".length), public_key);
    expect(payload.iss).toBe(API_SERVER_ID);
  });

  test("throws when the auth server refuses the subject token", async () => {
    const { fetch } = stubFetch(403, { success: false, error: "Forbidden" });
    await expect(
      listUserOrganizations({
        auth_server_url: AUTH_SERVER_URL,
        api_server_id: API_SERVER_ID,
        jwks_access_private_key: private_key,
        uid: UID,
        subject_token: SUBJECT_TOKEN,
        fetch,
      }),
    ).rejects.toThrow("status: 403");
  });

  test("throws on an answer about another user or with an unexpected shape", async () => {
    const other = stubFetch(200, {
      success: true,
      data: { uid: "22222222-2222-4222-8222-222222222222", memberships: [] },
    });
    await expect(
      listUserOrganizations({
        auth_server_url: AUTH_SERVER_URL,
        api_server_id: API_SERVER_ID,
        jwks_access_private_key: private_key,
        uid: UID,
        subject_token: SUBJECT_TOKEN,
        fetch: other.fetch,
      }),
    ).rejects.toThrow("unexpected response");

    const malformed = stubFetch(200, { success: true, data: { uid: UID, memberships: [{ organization_id: "acme" }] } });
    await expect(
      listUserOrganizations({
        auth_server_url: AUTH_SERVER_URL,
        api_server_id: API_SERVER_ID,
        jwks_access_private_key: private_key,
        uid: UID,
        subject_token: SUBJECT_TOKEN,
        fetch: malformed.fetch,
      }),
    ).rejects.toThrow("unexpected response");
  });

  test("refuses to send a request without a subject token or with a malformed uid", async () => {
    const { fetch, requests } = stubFetch(200, {});
    await expect(
      listUserOrganizations({
        auth_server_url: AUTH_SERVER_URL,
        api_server_id: API_SERVER_ID,
        jwks_access_private_key: private_key,
        uid: UID,
        subject_token: "",
        fetch,
      }),
    ).rejects.toThrow(TypeError);
    await expect(
      listUserOrganizations({
        auth_server_url: AUTH_SERVER_URL,
        api_server_id: API_SERVER_ID,
        jwks_access_private_key: private_key,
        uid: "not-a-uid",
        subject_token: SUBJECT_TOKEN,
        fetch,
      }),
    ).rejects.toThrow(TypeError);
    expect(requests).toHaveLength(0);
  });
});

describe("isUserInOrganization", () => {
  const roleBody = { success: true, data: { organization_id: "acme", uid: UID, role: "member" } };

  test("forwards the subject token when given", async () => {
    const { fetch, requests } = stubFetch(200, roleBody);
    const role = await isUserInOrganization(AUTH_SERVER_URL, API_SERVER_ID, private_key, UID, "acme", {
      subject_token: SUBJECT_TOKEN,
      fetch,
    });
    expect(role).toBe("member");
    expect(requests[0]!.url).toBe(`${AUTH_SERVER_URL}/api/resource-server/organizations/acme/members/${UID}/role`);
    expect(requests[0]!.headers.get("x-subject-token")).toBe(SUBJECT_TOKEN);
  });

  test("sends no subject token header without one", async () => {
    const { fetch, requests } = stubFetch(200, roleBody);
    await isUserInOrganization(AUTH_SERVER_URL, API_SERVER_ID, private_key, UID, "acme", { fetch });
    expect(requests[0]!.headers.has("x-subject-token")).toBe(false);
    expect(requests[0]!.headers.get("x-api-server-id")).toBe(API_SERVER_ID);
  });
});
