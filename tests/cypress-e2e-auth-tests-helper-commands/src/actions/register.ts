import { DEFAULT_AUTH_SERVER_APP_ID } from "@schemavaults/app-definitions";
import {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-common";

export default function register(
  email: string,
  password: string,
  invite_code?: string,
): Cypress.Chainable<number> {
  cy.is_authenticated().should(
    "be.false",
    "User should not be authenticated before registration",
  );

  // Clear Redis rate-limit counters so repeated register calls across tests
  // don't hit 429 responses.
  cy.reset_rate_limit();

  cy.intercept({
    method: "POST",
    url: "**/api/auth/register",
    times: 1,
  }).as("registerRequest");
  cy.intercept({
    method: "POST",
    url: `**/api/auth/token/authorization_code/${DEFAULT_AUTH_SERVER_APP_ID}`,
    times: 1,
  }).as("exchangeTokenRequest");
  cy.intercept({
    method: "GET",
    url: "**/account**",
    times: 1,
  }).as("loadAccountPage");

  cy.visit("/auth/register");
  cy.wait_for_page_hydration();
  cy.log(`Attempting to register as user: '${email}'`);
  cy.url({ log: false }).should("include", "/auth/register");

  cy.get("input[name='email']", { log: false })
    .should("exist")
    .should("not.be.disabled")
    .should("be.visible")
    .type(email, { force: true });
  cy.get("input[name='password']", { log: false })
    .should("exist")
    .should("not.be.disabled")
    .should("be.visible")
    .type(password, { force: true });
  cy.get("input[name='confirm']", { log: false })
    .should("exist")
    .should("not.be.disabled")
    .type(password, { force: true });
  if (invite_code) {
    cy.get("input[name='invite_code']", { log: false })
      .should("not.be.disabled")
      .type(invite_code, { force: true });
  }

  cy.get("input[name='email']", { log: false }).should("have.value", email);
  cy.get("input[name='password']", { log: false }).should(
    "have.value",
    password,
  );
  cy.get("input[name='confirm']", { log: false }).should(
    "have.value",
    password,
  );

  // Submit Form
  cy.get("button[type='submit']")
    .should("exist")
    .should("not.be.disabled")
    .click();

  cy.log("Submitted register form");

  const register_result: Cypress.Chainable<number> = cy
    .wait("@registerRequest", { timeout: 10000 })
    .then((register_interception): Cypress.Chainable<number> => {
      cy.log(
        `Register API response status: ${register_interception.response?.statusCode}`,
      );
      if (register_interception.response?.statusCode === 200) {
        cy.log("Register request succeeded");
        return cy
          .wait("@exchangeTokenRequest", { timeout: 15000 })
          .then((exchange_tokens_interception) => {
            if (exchange_tokens_interception.response?.statusCode === 200) {
              cy.log("Exchange token request succeeded");
              cy.getCookie(RefreshTokenCookieName(DEFAULT_AUTH_SERVER_APP_ID), {
                timeout: 10000,
              }).should("exist");
              cy.getCookie(
                RefreshTokenExpiryCookieName(DEFAULT_AUTH_SERVER_APP_ID),
                { timeout: 10000 },
              ).should("exist");
              return cy
                .wait("@loadAccountPage", {
                  timeout: 20000,
                  requestTimeout: 20000,
                })
                .then((account_interception) => {
                  const statusCode: number =
                    account_interception.response?.statusCode ?? 500;
                  if (statusCode < 400) {
                    cy.url({ timeout: 10000 }).should("include", "/account");
                    // Wait for page to be interactive
                    cy.get("body", { timeout: 10000 }).should("be.visible");
                    cy.log("Account page loaded successfully");
                    return cy.wrap(200, { log: false });
                  } else {
                    cy.log(
                      "Failed to load account page with status code: " +
                        statusCode,
                    );
                    return cy.wrap(statusCode, { log: false });
                  }
                });
            } else {
              cy.log(
                `Exchange token request failed with status ${exchange_tokens_interception.response?.statusCode} ${exchange_tokens_interception.response?.statusMessage}`,
              );
              return cy.wrap(
                exchange_tokens_interception.response?.statusCode ?? 500,
                { log: false },
              );
            }
          });
      } else {
        if (typeof register_interception.response?.statusCode !== "number") {
          throw new TypeError(
            "Failed to parse 'statusCode' from registration request interception!",
          );
        }
        const statusCode: number = register_interception.response?.statusCode;
        if (statusCode === 429) {
          const retryAfter =
            register_interception.response?.headers?.["retry-after"];
          throw new Error(
            `Register request was rate-limited (HTTP 429 Too Many Requests). ` +
              `The auth-server's POST /api/auth/register rate limit was exceeded ` +
              `(3 attempts/hour per IP). Retry-After: ${retryAfter ?? "unknown"}s. ` +
              `Call cy.reset_rate_limit() before this command, or ensure the ` +
              `auth-server is running in test environment with the reset-rate-limit endpoint available.`,
          );
        }
        cy.log(
          `Register request failed with status ${statusCode} ${register_interception.response?.statusMessage}`,
        );
        return cy.wrap(statusCode, {
          log: false,
        });
      }
    });

  return register_result.then((res: number) => {
    if (typeof res === "number") return res;
    else if (typeof res[0] === "number") return res[0];
    else
      throw new TypeError(
        "Failed to parse status code to return from 'register' Cypress command!",
      );
  });
}
