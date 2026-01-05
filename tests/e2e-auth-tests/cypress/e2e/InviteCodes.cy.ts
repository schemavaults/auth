describe("Invite Codes", () => {
  it("can visit the invite code management page as a superuser", () => {
    cy.create_and_login_as_superuser().then((success) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }

      cy.visit("/admin/invite_codes");
      cy.wait(1000);
      cy.url().should("include", "/admin/invite_codes");
    });
  });

  it("unauthenticated users are redirected from the invite codes page", () => {
    cy.visit("/admin/invite_codes");
    cy.wait(1000);
    cy.url().should("include", "/login");
  });
});
