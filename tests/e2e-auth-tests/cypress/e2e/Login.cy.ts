describe("Login", () => {
  it("can load the login page", () => {
    cy.visit("/auth/login");
  });

  it("can submit an invalid login form and not be redirected", () => {
    cy.visit("/auth/login");
    cy.get("input[name='email']").type("testinvalidcredentials@example.com", {
      force: true,
    });
    cy.get("input[name='password']").type("passWord123!@#", { force: true }); // random credentials
    cy.get("button[type='submit']").click();
    cy.url().should("include", "/auth/login");
  });

  it("can login as superuser and is redirected from /auth/login to /account", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }

      cy.visit("/auth/login");
      cy.wait(2000);
      cy.url().should("not.include", "/auth/login");
      cy.url().should("include", "/account");
    });
  });
});
