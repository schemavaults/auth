// Verifies access control on the /admin/errors list and
// /admin/errors/[error_id] detail pages. Both pages are gated by
// withAdminServerComponentRouteGuard in
// auth-server/src/lib/withAdminRouteGuard.ts, which enforces
// user.admin === true. Unauthenticated visitors get bounced before the admin
// check; authenticated-but-non-admin visitors hit the admin layout guard and
// are redirected to /error?error=403.

describe("Admin Errors Pages", () => {
  const fakeErrorId = "00000000-0000-0000-0000-000000000003";

  describe("Unauthenticated Access", () => {
    it("unauthenticated users are redirected off /admin/errors", () => {
      cy.visit("/admin/errors");
      cy.url().should("not.include", "/admin/errors");
    });

    it("unauthenticated users are redirected off /admin/errors/[error_id]", () => {
      cy.visit(`/admin/errors/${fakeErrorId}`);
      cy.url().should("not.include", `/admin/errors/${fakeErrorId}`);
    });
  });

  describe("Regular User Access Restrictions", () => {
    beforeEach(() => {
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user(credentials).then(
          (loggedIn: boolean) => {
            if (!loggedIn) {
              throw new Error("Failed to create and login as regular user");
            }
          },
        );
      });
    });

    it("non-admin users are redirected from /admin/errors with 403 forbidden", () => {
      cy.visit("/admin/errors", { failOnStatusCode: false });
      cy.url().should("include", "/error");
      cy.url().should("include", "error=403");
    });

    it("non-admin users are redirected from /admin/errors/[error_id] with 403 forbidden", () => {
      cy.visit(`/admin/errors/${fakeErrorId}`, { failOnStatusCode: false });
      cy.url().should("include", "/error");
      cy.url().should("include", "error=403");
    });
  });

  describe("Admin Access", () => {
    it("admin can view the /admin/errors list page", () => {
      cy.create_and_login_as_superuser().then((success: boolean) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.visit("/admin/errors");
        cy.url().should("include", "/admin/errors");
        cy.get('[data-testid="admin-errors-card"]').should("exist");
      });
    });

    it("admin hitting a nonexistent error_id is not blocked by the admin guard", () => {
      cy.create_and_login_as_superuser().then((success: boolean) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        // No row exists for this id, so the detail page will redirect to
        // /error with a 400 bad_request. The critical assertion is that we
        // did NOT get 403 — i.e. the admin guard passed and the redirect is
        // coming from the "not found" branch of the detail page itself.
        cy.visit(`/admin/errors/${fakeErrorId}`, { failOnStatusCode: false });
        cy.url().should("include", "/error");
        cy.url().should("not.include", "error=403");
      });
    });
  });
});
