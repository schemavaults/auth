// Covers the server-settings admin API beyond its 401/403 guards:
//   GET   /api/admin/settings          -> the full settings list
//   PATCH /api/admin/settings/[key]    -> validation + persistence
// The PATCH success path toggles `private_beta_mode` (a flag with no effect
// on any other endpoint exercised by this suite) and restores it afterwards
// so the change cannot leak into other specs.

interface ServerSettingRecord {
  key: string;
  value: unknown;
  valueType: string;
  description?: string;
}

interface ListSettingsResponseBody {
  success: boolean;
  data?: { settings: ServerSettingRecord[] };
}

interface PatchSettingResponseBody {
  success: boolean;
  message?: string;
  data?: { key: string; value: unknown };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const TOGGLED_KEY = "private_beta_mode";

describe("Admin settings API", () => {
  beforeEach(() => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
  });

  afterEach(() => {
    // Always restore the toggled flag, even if an assertion failed midway.
    cy.request({
      method: "PATCH",
      url: `/api/admin/settings/${TOGGLED_KEY}`,
      body: { value: false },
      failOnStatusCode: false,
    });
  });

  it("GET /api/admin/settings lists every known setting with its type", () => {
    cy.request<ListSettingsResponseBody>({
      method: "GET",
      url: "/api/admin/settings",
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      const settings = response.body.data?.settings ?? [];
      const keys = settings.map((s) => s.key);
      for (const expected of [
        "invite_code_required",
        "private_beta_mode",
        "admin_only_organization_creation",
        "allow_user_owned_resource_creation",
        "mail_server_configured",
        "mail_server_api_id",
        "spoofed_superuser_email",
        "service_account_email_domain",
      ]) {
        expect(keys, `settings include ${expected}`).to.include(expected);
      }
      for (const setting of settings) {
        expect(setting.valueType, `${setting.key} valueType`).to.be.oneOf([
          "boolean",
          "string",
        ]);
        expect(typeof setting.value, `${setting.key} value type`).to.eq(
          setting.valueType,
        );
      }
    });
  });

  describe("PATCH /api/admin/settings/:key validation", () => {
    it("returns 400 for an unknown setting key", () => {
      cy.request<PatchSettingResponseBody>({
        method: "PATCH",
        url: "/api/admin/settings/not_a_real_setting",
        body: { value: true },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
      });
    });

    it("returns 400 when the value has the wrong type for the key", () => {
      cy.request<PatchSettingResponseBody>({
        method: "PATCH",
        url: "/api/admin/settings/invite_code_required",
        body: { value: "yes" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
      });
    });

    it("returns 400 when the 'value' field is missing", () => {
      cy.request<PatchSettingResponseBody>({
        method: "PATCH",
        url: "/api/admin/settings/invite_code_required",
        body: { description: "no value here" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
      });
    });

    it("returns 400 for a non-JSON body", () => {
      cy.request<PatchSettingResponseBody>({
        method: "PATCH",
        url: "/api/admin/settings/invite_code_required",
        headers: { "content-type": "application/json" },
        body: "{not json",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
      });
    });
  });

  it("PATCH /api/admin/settings/:key persists a valid value and reports it back", () => {
    cy.request<PatchSettingResponseBody>({
      method: "PATCH",
      url: `/api/admin/settings/${TOGGLED_KEY}`,
      body: { value: true, description: "toggled by E2E AdminSettingsApi" },
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      expect(response.body.data).to.deep.equal({ key: TOGGLED_KEY, value: true });
    });

    cy.request<ListSettingsResponseBody>({
      method: "GET",
      url: "/api/admin/settings",
    }).then((response) => {
      const toggled = response.body.data?.settings.find(
        (s) => s.key === TOGGLED_KEY,
      );
      expect(toggled, "toggled setting present").to.exist;
      expect(toggled?.value, "persisted value").to.eq(true);
    });

    cy.request<PatchSettingResponseBody>({
      method: "PATCH",
      url: `/api/admin/settings/${TOGGLED_KEY}`,
      body: { value: false },
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.data?.value).to.eq(false);
    });
  });
});
