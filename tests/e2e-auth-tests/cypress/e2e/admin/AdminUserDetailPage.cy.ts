describe("Admin User Detail Page", () => {
  const fakeUid = "00000000-0000-0000-0000-000000000001";

  describe("Unauthenticated Access", () => {
    it("unauthenticated users are redirected off /admin/users/[uid]", () => {
      cy.visit(`/admin/users/${fakeUid}`);
      cy.url().should("not.include", `/admin/users/${fakeUid}`);
    });
  });

  describe("Regular User Access Restrictions", () => {
    it("non-admin users are redirected from the user detail page with 403 forbidden", () => {
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user(credentials).then(() => {
          cy.visit(`/admin/users/${fakeUid}`, { failOnStatusCode: false });
          cy.url().should("include", "/error");
          cy.url().should("include", "error=403");
        });
      });
    });
  });

  describe("Admin Access", () => {
    it("admin can view the user detail page", () => {
      cy.create_and_login_as_superuser().then((success: boolean) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.visit("/admin/users");
        cy.url().should("include", "/admin/users");

        cy.get('[data-testid^="users-table-row-link-"]')
          .first()
          .then(($link) => {
            const href: string | undefined = $link.attr("href");
            if (!href) {
              throw new Error("Expected user row link to have an href");
            }
            cy.wrap($link).click();
            cy.url().should("include", href);
            cy.get('[data-testid="admin-user-detail-card"]').should("exist");
          });
      });
    });
  });
});
