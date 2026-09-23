// Response-shape contracts of the authenticated read endpoints. Most of
// these routes only had 401 (unauthenticated) coverage; their success
// envelopes are what the client SDK, @schemavaults/auth-ui hooks and the
// auth-server's own SWR hooks parse, so they are pinned here (status code,
// `success` flag, top-level data keys and element types) before the route
// handlers move onto @schemavaults/openapi-operations. Messages are not
// asserted verbatim: only the fields clients read.

interface Envelope {
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function get(url: string): Cypress.Chainable<Cypress.Response<Envelope>> {
  return cy.request<Envelope>({ method: "GET", url, failOnStatusCode: false });
}

describe("Authenticated API response shapes", () => {
  describe("as a regular user", () => {
    beforeEach(() => {
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request(credentials).then(
          (ok: boolean) => expect(ok, "regular user login").to.be.true,
        );
      });
    });

    it("GET /api/user/organizations -> { success, organizations[] }", () => {
      get("/api/user/organizations").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.organizations).to.be.an("array");
      });
    });

    it("GET /api/me/organizations -> { success, message, data.memberships[] }", () => {
      get("/api/me/organizations").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.message).to.be.a("string");
        expect(response.body.data?.memberships).to.be.an("array");
      });
    });

    it("GET /api/me/invitations -> { success, data.invitations[] }", () => {
      get("/api/me/invitations").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data?.invitations).to.be.an("array");
      });
    });

    it("GET /api/user/profile -> { success, profile }", () => {
      get("/api/user/profile").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.profile).to.be.an("object");
      });
    });

    it("GET /api/user/mfa/status -> raw { enabled, factors[], recovery_codes_remaining }", () => {
      get("/api/user/mfa/status").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.enabled).to.eq(false);
        expect(response.body.factors).to.deep.eq([]);
        expect(response.body.recovery_codes_remaining).to.be.a("number");
        // Raw payload (no `success` envelope): the client SDK parses it with
        // the strict mfaStatusResponseSchema.
        expect(response.body).to.not.have.property("success");
      });
    });

    it("GET /api/user/mfa/webauthn -> raw { credentials[] }", () => {
      get("/api/user/mfa/webauthn").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.credentials).to.deep.eq([]);
      });
    });

    it("GET /api/apps?list_apps_query_type=public -> { success, message, list[] }", () => {
      get("/api/apps?list_apps_query_type=public").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.list).to.be.an("array");
      });
    });

    it("GET /api/apps?list_apps_query_type=all is admin-only (403)", () => {
      get("/api/apps?list_apps_query_type=all").then((response) => {
        expect(response.status).to.eq(403);
        expect(response.body.success).to.eq(false);
      });
    });

    it("GET /api/apps with an unknown list_apps_query_type is a 400", () => {
      get("/api/apps?list_apps_query_type=bogus").then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
      });
    });

    it("GET /api/apis?list_apis_query_type=accessible -> { success, list[] }", () => {
      get("/api/apis?list_apis_query_type=accessible").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.list).to.be.an("array");
      });
    });

    it("GET /api/apps/:app_id for an unknown app is a 404 envelope", () => {
      get("/api/apps/00000000-0000-0000-0000-00000000dead").then((response) => {
        expect(response.status).to.eq(404);
        expect(response.body.success).to.eq(false);
        expect(response.body.message).to.be.a("string");
      });
    });

    it("GET /api/apps/:app_id with a malformed id is a 400 envelope", () => {
      get("/api/apps/not%20a%20valid%20app%20id!").then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
        expect(response.body.message).to.be.a("string");
      });
    });

    it("GET /api/organizations (admin listing) is a 403 for regular users", () => {
      get("/api/organizations").then((response) => {
        expect(response.status).to.eq(403);
        expect(response.body.success).to.eq(false);
      });
    });
  });

  describe("as the superuser", () => {
    beforeEach(() => {
      cy.create_and_login_as_superuser_via_request().then((ok: boolean) =>
        expect(ok, "superuser login").to.be.true,
      );
    });

    it("GET /api/organizations -> { success, data.organizations[] }", () => {
      get("/api/organizations").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data?.organizations).to.be.an("array");
      });
    });

    it("GET /api/admin/settings -> { success, data.settings[] }", () => {
      get("/api/admin/settings").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data?.settings).to.be.an("array");
      });
    });

    it("GET /api/admin/users/list -> { success, data.users[] }", () => {
      get("/api/admin/users/list").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        const users = response.body.data?.users as { uid: string; email: string }[];
        expect(users).to.be.an("array").and.not.be.empty;
        expect(users[0]).to.have.property("uid");
        expect(users[0]).to.have.property("email");
      });
    });

    it("GET /api/admin/branding -> { success, data.assets[] }", () => {
      get("/api/admin/branding").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data?.assets).to.be.an("array");
      });
    });

    it("GET /api/admin/server-traces -> { success, data.traces[] }", () => {
      get("/api/admin/server-traces").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data?.traces).to.be.an("array");
      });
    });

    it("GET /api/admin/invite-codes -> { success, data.invite_codes[] }", () => {
      get("/api/admin/invite-codes").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data?.invite_codes).to.be.an("array");
      });
    });

    it("GET /api/apps?list_apps_query_type=all -> { success, list[] }", () => {
      get("/api/apps?list_apps_query_type=all").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.list).to.be.an("array");
      });
    });
  });

  describe("public configuration endpoints", () => {
    it("GET /api/environment -> { environment: 'test' }", () => {
      get("/api/environment").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.environment).to.eq("test");
      });
    });

    it("GET /api/config/invite_code_required -> { success, data: boolean }", () => {
      get("/api/config/invite_code_required").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data).to.be.a("boolean");
      });
    });

    it("GET /api/config/branding -> { data: { friendly_name, ... } }", () => {
      get("/api/config/branding").then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.data).to.be.an("object");
        expect((response.body.data as Record<string, unknown>).friendly_name).to.be.a("string");
      });
    });
  });
});
