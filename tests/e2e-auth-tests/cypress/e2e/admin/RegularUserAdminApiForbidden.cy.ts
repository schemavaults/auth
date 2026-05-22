// Verifies the auth-server admin-only API endpoints reject authenticated-but-
// non-admin requests with a 403 Forbidden response. These routes are guarded
// by `withAdminApiRouteGuard` in auth-server/src/lib/withAdminRouteGuard.ts,
// which enforces `user.admin === true`. The unauthenticated (401) case is
// already covered by UnauthenticatedApiRequests.cy.ts, but the
// authenticated-non-admin (403) case — the primary privilege-escalation
// boundary — was not previously covered.

describe("Regular User Admin API Forbidden", () => {
  const fakeUid = "00000000-0000-0000-0000-000000000001";
  const fakeSettingKey = "nonexistent_setting_key";
  const fakeErrorId = "00000000-0000-0000-0000-000000000002";

  // Create + login a fresh regular (non-admin) user before each test so that
  // no state leaks between the individual 403 assertions.
  beforeEach(() => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          if (!loggedIn) {
            throw new Error("Failed to create and login as regular user");
          }
        },
      );
    });
  });

  it("POST /api/admin/promote/:uid returns 403 for authenticated non-admin", () => {
    cy.request({
      method: "POST",
      url: `/api/admin/promote/${fakeUid}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("GET /api/admin/users/list returns 403 for authenticated non-admin", () => {
    cy.request({
      method: "GET",
      url: "/api/admin/users/list",
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("GET /api/admin/invite-codes returns 403 for authenticated non-admin", () => {
    cy.request({
      method: "GET",
      url: "/api/admin/invite-codes",
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("POST /api/admin/invite-codes returns 403 for authenticated non-admin", () => {
    cy.request({
      method: "POST",
      url: "/api/admin/invite-codes",
      failOnStatusCode: false,
      body: {
        invite_code: "should-not-be-created",
        max_uses: 1,
      },
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("GET /api/admin/settings returns 403 for authenticated non-admin", () => {
    cy.request({
      method: "GET",
      url: "/api/admin/settings",
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("PATCH /api/admin/settings/:key returns 403 for authenticated non-admin", () => {
    cy.request({
      method: "PATCH",
      url: `/api/admin/settings/${fakeSettingKey}`,
      failOnStatusCode: false,
      body: { value: "anything" },
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("GET /api/admin/server-traces returns 403 for authenticated non-admin", () => {
    cy.request({
      method: "GET",
      url: "/api/admin/server-traces",
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("DELETE /api/admin/errors returns 403 for authenticated non-admin", () => {
    cy.request({
      method: "DELETE",
      url: `/api/admin/errors?before=${encodeURIComponent(
        new Date().toISOString(),
      )}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("DELETE /api/admin/errors without 'before' param returns 403 for authenticated non-admin", () => {
    // The admin guard must short-circuit before parameter validation so that
    // a non-admin can never distinguish "missing before" (400) from "not
    // admin" (403). 403 must beat 400.
    cy.request({
      method: "DELETE",
      url: "/api/admin/errors",
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("DELETE /api/admin/errors/:errorId returns 403 for authenticated non-admin", () => {
    cy.request({
      method: "DELETE",
      url: `/api/admin/errors/${fakeErrorId}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("GET /api/admin/users/:uid/mfa returns 403 for authenticated non-admin", () => {
    cy.request({
      method: "GET",
      url: `/api/admin/users/${fakeUid}/mfa`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
  });
});
