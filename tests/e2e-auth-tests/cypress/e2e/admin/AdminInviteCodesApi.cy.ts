// Request-level coverage of the invite-code admin API. The creation path was
// previously exercised only through the /admin/invite_codes UI, the listing
// endpoint had no consumer in the suite at all, and the usage counter
// endpoint was entirely untested:
//   POST /api/admin/invite-codes
//   GET  /api/admin/invite-codes
//   GET  /api/admin/invite-codes/[invite_code]/usages

interface InviteCodeDefinition {
  invite_code: string;
  created_at: number;
  max_uses: number;
  description?: string;
  created_by?: string;
}

interface CreateInviteCodeResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
}

interface ListInviteCodesResponseBody {
  success: boolean;
  data?: { invite_codes: InviteCodeDefinition[] };
}

interface InviteCodeUsagesResponseBody {
  success: boolean;
  message?: string;
  data?: { invite_code: string; usage_count: number };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

describe("Admin invite codes API", () => {
  beforeEach(() => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
  });

  it("creates, lists and counts usages of an invite code", () => {
    cy.generate_random_code(16).then((random: string) => {
      const invite_code = `e2e-api-${random}`;

      cy.request<CreateInviteCodeResponseBody>({
        method: "POST",
        url: "/api/admin/invite-codes",
        body: {
          invite_code,
          created_at: Date.now(),
          max_uses: 2,
          description: "Created by AdminInviteCodesApi.cy.ts",
        },
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.resource_id).to.eq(invite_code);
      });

      cy.request<ListInviteCodesResponseBody>({
        method: "GET",
        url: "/api/admin/invite-codes",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        const created = response.body.data?.invite_codes.find(
          (c) => c.invite_code === invite_code,
        );
        expect(created, "new invite code in listing").to.exist;
        expect(created?.max_uses).to.eq(2);
        expect(created?.description).to.eq(
          "Created by AdminInviteCodesApi.cy.ts",
        );
        expect(created?.created_by, "created_by is set server-side").to.be.a(
          "string",
        );
      });

      cy.request<InviteCodeUsagesResponseBody>({
        method: "GET",
        url: `/api/admin/invite-codes/${invite_code}/usages`,
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data).to.deep.equal({
          invite_code,
          usage_count: 0,
        });
      });

      // Consume the code once and confirm the counter follows.
      cy.logout();
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request({
          ...credentials,
          invite_code,
        }).then((created: boolean) => {
          expect(created, "registration with the new code").to.be.true;
          cy.logout();
        });
      });

      cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
        expect(ok).to.be.true;
        cy.request<InviteCodeUsagesResponseBody>({
          method: "GET",
          url: `/api/admin/invite-codes/${invite_code}/usages`,
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.data?.usage_count).to.eq(1);
        });
      });
    });
  });

  it("GET usages returns 400 for a malformed invite code and 0 for a never-used one", () => {
    cy.request<InviteCodeUsagesResponseBody>({
      method: "GET",
      url: "/api/admin/invite-codes/bad!code/usages",
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400);
      expect(response.body.success).to.eq(false);
    });

    cy.request<InviteCodeUsagesResponseBody>({
      method: "GET",
      url: "/api/admin/invite-codes/never-issued-e2e-code/usages",
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.data?.usage_count).to.eq(0);
    });
  });

  describe("POST /api/admin/invite-codes validation", () => {
    it("returns 400 when required fields are missing", () => {
      cy.request<CreateInviteCodeResponseBody>({
        method: "POST",
        url: "/api/admin/invite-codes",
        body: { invite_code: "e2e-missing-fields", max_uses: 1 },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
      });
    });

    it("returns 400 for unknown fields (strict schema)", () => {
      cy.request<CreateInviteCodeResponseBody>({
        method: "POST",
        url: "/api/admin/invite-codes",
        body: {
          invite_code: `e2e-extra-${Date.now()}`,
          created_at: Date.now(),
          max_uses: 1,
          unexpected_field: true,
        },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
      });
    });

    it("returns 409 for an invite code that already exists", () => {
      cy.generate_random_code(16).then((random: string) => {
        const invite_code = `e2e-dup-${random}`;
        cy.request<CreateInviteCodeResponseBody>({
          method: "POST",
          url: "/api/admin/invite-codes",
          body: { invite_code, created_at: Date.now(), max_uses: 1 },
        }).then((response) => {
          expect(response.status, "first create").to.eq(200);
        });
        cy.request<CreateInviteCodeResponseBody>({
          method: "POST",
          url: "/api/admin/invite-codes",
          body: { invite_code, created_at: Date.now(), max_uses: 1 },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "duplicate invite code").to.eq(409);
          expect(response.body.success).to.eq(false);
        });
      });
    });

    it("returns 412 when created_at is more than 30 seconds in the past", () => {
      cy.request<CreateInviteCodeResponseBody>({
        method: "POST",
        url: "/api/admin/invite-codes",
        body: {
          invite_code: `e2e-stale-${Date.now()}`,
          created_at: Date.now() - 2 * 60 * 1000,
          max_uses: 1,
        },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(412);
        expect(response.body.success).to.eq(false);
      });
    });
  });
});
