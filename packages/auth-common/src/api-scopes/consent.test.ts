import { describe, expect, test } from "bun:test";
import {
  appConsentStatusSchema,
  approvedApiScopesSchema,
  connectedAppSchema,
} from "./consent";
import {
  appApiScopePolicySchema,
  updateAppApiScopePolicyRequestSchema,
} from "./scope-grants";

const SCOPE_ID = "6f1c1f4e-8a39-4c43-9b3e-2f0d6a1d6a10";

describe("updateAppApiScopePolicyRequestSchema", () => {
  test("accepts a full policy", () => {
    expect(
      updateAppApiScopePolicyRequestSchema.safeParse({
        restrict_user_scopes: true,
        user_scopes: ["notes:read"],
        service_account_scopes: ["notes:read", "notes:write"],
      }).success,
    ).toBe(true);
  });

  test("rejects duplicate scope values", () => {
    expect(
      updateAppApiScopePolicyRequestSchema.safeParse({
        restrict_user_scopes: false,
        user_scopes: [],
        service_account_scopes: ["notes:read", "notes:read"],
      }).success,
    ).toBe(false);
  });

  test("rejects malformed scope values, missing fields and unknown keys", () => {
    expect(
      updateAppApiScopePolicyRequestSchema.safeParse({
        restrict_user_scopes: false,
        user_scopes: ["two words"],
        service_account_scopes: [],
      }).success,
    ).toBe(false);
    expect(
      updateAppApiScopePolicyRequestSchema.safeParse({ restrict_user_scopes: false }).success,
    ).toBe(false);
    expect(
      updateAppApiScopePolicyRequestSchema.safeParse({
        restrict_user_scopes: false,
        user_scopes: [],
        service_account_scopes: [],
        extra: 1,
      }).success,
    ).toBe(false);
  });
});

describe("appApiScopePolicySchema", () => {
  test("parses the default (unrestricted, no service-account scopes) policy", () => {
    expect(
      appApiScopePolicySchema.safeParse({
        restrict_user_scopes: false,
        user_scopes: [],
        service_account_scopes: [],
      }).success,
    ).toBe(true);
  });
});

describe("appConsentStatusSchema", () => {
  test("parses a status asking for one pending API scope", () => {
    expect(
      appConsentStatusSchema.safeParse({
        success: true,
        authorized: true,
        consent_required: true,
        requested_oidc_scopes: ["openid"],
        api_server: { api_server_id: "notes-api", api_server_name: "Notes" },
        granted_api_scopes: [],
        pending_api_scopes: [
          { api_server_scope_id: SCOPE_ID, scope: "notes:read", description: "Read your notes" },
        ],
      }).success,
    ).toBe(true);
  });

  test("parses a status without an API server", () => {
    expect(
      appConsentStatusSchema.safeParse({
        success: true,
        authorized: false,
        consent_required: true,
        requested_oidc_scopes: ["openid", "email"],
        api_server: null,
        granted_api_scopes: [],
        pending_api_scopes: [],
      }).success,
    ).toBe(true);
  });
});

describe("approvedApiScopesSchema", () => {
  test("accepts scope values and rejects malformed ones", () => {
    expect(approvedApiScopesSchema.safeParse(["notes:read"]).success).toBe(true);
    expect(approvedApiScopesSchema.safeParse([]).success).toBe(true);
    expect(approvedApiScopesSchema.safeParse(["notes read"]).success).toBe(false);
  });
});

describe("connectedAppSchema", () => {
  test("parses an app with a never-used token history", () => {
    expect(
      connectedAppSchema.safeParse({
        app_id: "notes-web",
        app_name: "Notes",
        app_description: "",
        authorized_at: 1_700_000_000_000,
        last_used_at: null,
        api_scopes: [
          {
            api_server_id: "notes-api",
            api_server_name: "Notes API",
            api_server_scope_id: SCOPE_ID,
            scope: "notes:read",
            description: "Read your notes",
            granted_at: 1_700_000_000_000,
          },
        ],
      }).success,
    ).toBe(true);
  });
});
