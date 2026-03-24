describe("ExampleResourceServer", () => {
  it("can visit the example resource server", async () => {
    cy.visit("http://example-nextjs-resource-server:3007");
  });
});
