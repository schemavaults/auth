// Guard spec for the white_label suite: fails loudly if the white-label
// environment wiring breaks anywhere along the chain
// (e2e-auth-tests-cli.ts -> docker-compose.yml interpolation -> auth-server
// container env + Cypress runner env -> cypress.config.ts env block).
// Without this tripwire the rest of the suite could silently pass while
// testing the stock (default-branded) deployment configuration.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  DEFAULT_AUTH_SERVER_APP_ID,
  DEFAULT_AUTH_SERVER_FRIENDLY_NAME,
  DEFAULT_AUTH_SERVER_DESCRIPTION,
} from "@schemavaults/app-definitions";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();
const FRIENDLY_NAME: string = Cypress.env(
  "SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME",
);
const DESCRIPTION: string = Cypress.env("SCHEMAVAULTS_AUTH_SERVER_DESCRIPTION");
const THEME_COLOR_1: string = Cypress.env(
  "SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1",
);
const THEME_COLOR_2: string = Cypress.env(
  "SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2",
);

describe("White-label environment wiring", () => {
  it("runs against a NON-default auth server app id", () => {
    expect(
      AUTH_APP_ID,
      "SCHEMAVAULTS_AUTH_SERVER_APP_ID must be set to a non-default app id for the white_label suite",
    ).to.not.eq(DEFAULT_AUTH_SERVER_APP_ID);
    expect(AUTH_APP_ID).to.eq(
      Cypress.env("SCHEMAVAULTS_AUTH_SERVER_APP_ID"),
    );
  });

  it("has non-empty custom branding environment values", () => {
    expect(FRIENDLY_NAME, "friendly name env").to.be.a("string").and.not.be
      .empty;
    expect(FRIENDLY_NAME).to.not.eq(DEFAULT_AUTH_SERVER_FRIENDLY_NAME);
    expect(DESCRIPTION, "description env").to.be.a("string").and.not.be.empty;
    expect(DESCRIPTION).to.not.eq(DEFAULT_AUTH_SERVER_DESCRIPTION);
    expect(THEME_COLOR_1, "theme color 1 env").to.be.a("string").and.not.be
      .empty;
    expect(THEME_COLOR_2, "theme color 2 env").to.be.a("string").and.not.be
      .empty;
    expect(THEME_COLOR_1).to.not.eq(THEME_COLOR_2);
  });

  it("the auth server itself received the white-label env (not just the test runner)", () => {
    // The <title> is resolved server-side per request from
    // SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME by the root layout's
    // generateMetadata(), so this proves the auth-server container got the
    // custom branding env too.
    cy.visit("/auth/login");
    cy.title().should("eq", FRIENDLY_NAME);
  });
});
