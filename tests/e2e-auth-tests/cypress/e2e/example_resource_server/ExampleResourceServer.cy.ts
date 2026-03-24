describe("ExampleResourceServer", () => {
  it("can visit the example resource server", async () => {
    cy.visit("http://example-nextjs-resource-server:3007");
    cy.url().should("include", "example-nextjs-resource-server");
    cy.contains("h1", "@schemavaults/example-nextjs-resource-server");
  });
});
