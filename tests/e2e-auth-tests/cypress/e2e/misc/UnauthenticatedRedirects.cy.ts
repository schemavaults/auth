describe("Unauthenticated Redirects", () => {
  describe("Authenticated pages", () => {
    it("is redirected off the account page", () => {
      cy.visit("/account");
      cy.url().should("not.include", "/account");
    });

    it("is redirected off the org page", () => {
      cy.visit("/org/fake-org-id");
      cy.url().should("not.include", "/org/fake-org-id");
    });

    it("is redirected off the API server detail page", () => {
      const fakeApiServerId = "00000000-0000-0000-0000-000000000001";
      cy.visit(`/apis/${fakeApiServerId}`);
      cy.url().should("not.include", `/apis/${fakeApiServerId}`);
    });

    it("is redirected off the app detail page", () => {
      const fakeAppId = "00000000-0000-0000-0000-000000000002";
      cy.visit(`/apps/${fakeAppId}`);
      cy.url().should("not.include", `/apps/${fakeAppId}`);
    });

    it("is redirected off the JWKS access keys page", () => {
      const fakeApiServerId = "00000000-0000-0000-0000-000000000001";
      cy.visit(`/apis/${fakeApiServerId}/jwks-access-keys`);
      cy.url().should(
        "not.include",
        `/apis/${fakeApiServerId}/jwks-access-keys`,
      );
    });
  });

  describe("Admin pages", () => {
    it("is redirected off the admin page", () => {
      cy.visit("/admin");
      cy.url().should("not.include", "/admin");
    });

    it("is redirected off the admin users page", () => {
      cy.visit("/admin/users");
      cy.url().should("not.include", "/admin/users");
    });

    it("is redirected off the admin apps page", () => {
      cy.visit("/admin/apps");
      cy.url().should("not.include", "/admin/apps");
    });

    it("is redirected off the admin apis page", () => {
      cy.visit("/admin/apis");
      cy.url().should("not.include", "/admin/apis");
    });

    it("is redirected off the admin organizations page", () => {
      cy.visit("/admin/organizations");
      cy.url().should("not.include", "/admin/organizations");
    });

    it("is redirected off the admin invite codes page", () => {
      cy.visit("/admin/invite_codes");
      cy.url().should("not.include", "/admin/invite_codes");
    });

    it("is redirected off the admin settings page", () => {
      cy.visit("/admin/settings");
      cy.url().should("not.include", "/admin/settings");
    });

    it("is redirected off the admin server traces page", () => {
      cy.visit("/admin/traces");
      cy.url().should("not.include", "/admin/traces");
    });
  });
});
