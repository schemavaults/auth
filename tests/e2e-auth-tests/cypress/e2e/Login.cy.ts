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
});
