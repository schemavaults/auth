function loadEnvironmentFromEndpoint(
  additionalAssertions?: (
    environment: "production" | "staging" | "test" | "development",
  ) => void,
) {
  cy.request("/api/environment").then((response) => {
    expect(response.status).to.eq(200);
    expect(typeof response.body).to.equal("object");
    expect(response.body).to.haveOwnProperty("environment");
    const environment = response.body.environment;
    expect(typeof environment).to.equal("string");
    expect(["development", "production", "test", "staging"]).to.include(
      environment,
    );
    if (typeof additionalAssertions === "function") {
      additionalAssertions(environment);
    }
  });
}

describe("App Environment Endpoint", () => {
  it("should return a valid environment type", () => {
    loadEnvironmentFromEndpoint();
  });

  it("should match the Cypress environment's SCHEMAVAULTS_APP_ENVIRONMENT value", () => {
    loadEnvironmentFromEndpoint((environment) => {
      expect(environment).to.equal(Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT"));
    });
  });
});
