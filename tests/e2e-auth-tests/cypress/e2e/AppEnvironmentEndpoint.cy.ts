describe("App Environment Endpoint", () => {
  it("should return a valid environment type", () => {
    cy.request("/api/environment").then((response) => {
      expect(response.status).to.eq(200);
      expect(typeof response.body).to.equal("object");
      expect(response.body).to.haveOwnProperty("environment");
      const environment = response.body.environment;
      expect(typeof environment).to.equal("string");
      expect(["development", "production", "test", "staging"]).to.include(
        environment,
      );
    });
  });
});
