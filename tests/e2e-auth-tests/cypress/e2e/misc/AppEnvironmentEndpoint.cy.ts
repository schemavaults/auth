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

const SCHEMAVAULTS_APP_ENVIRONMENT = Cypress.env(
  "SCHEMAVAULTS_APP_ENVIRONMENT",
);
if (
  !SCHEMAVAULTS_APP_ENVIRONMENT ||
  typeof SCHEMAVAULTS_APP_ENVIRONMENT !== "string"
) {
  throw new Error(
    "SCHEMAVAULTS_APP_ENVIRONMENT is not defined or not a string",
  );
}

describe("App Environment Endpoint", () => {
  it("should return a valid environment type", () => {
    loadEnvironmentFromEndpoint();
  });

  it(`should match the Cypress environment's SCHEMAVAULTS_APP_ENVIRONMENT value (${SCHEMAVAULTS_APP_ENVIRONMENT})`, () => {
    loadEnvironmentFromEndpoint((environment) => {
      expect(environment).to.equal(SCHEMAVAULTS_APP_ENVIRONMENT);
    });
  });
});
