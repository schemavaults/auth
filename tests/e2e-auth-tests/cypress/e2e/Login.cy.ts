describe("Login", () => {
  it("can load the login page", () => {
    cy.visit("/auth/login");
  });
});
