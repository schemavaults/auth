import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import { RefreshTokenCookieName } from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

function superuserCredentials(): { email: string; password: string } {
  const email = Cypress.env("PRIVATE_SUPERUSER_EMAIL");
  const password = Cypress.env("PRIVATE_SUPERUSER_PASSWORD");
  if (!email || !password) {
    throw new Error(
      "PRIVATE_SUPERUSER_EMAIL and PRIVATE_SUPERUSER_PASSWORD environment variables are not set",
    );
  }
  return { email, password };
}

function fillAndSubmitLoginForm(email: string, password: string): void {
  cy.wait_for_page_hydration();
  cy.get("input[name='email']")
    .should("be.visible")
    .should("not.be.disabled")
    .type(email, { force: true });
  cy.get("input[name='password']")
    .should("be.visible")
    .should("not.be.disabled")
    .type(password, { force: true });
  cy.get("button[type='submit']").should("not.be.disabled").click();
}

describe("Post-login redirect via next_href", () => {
  beforeEach(() => {
    cy.reset_rate_limit();
  });

  it("route guard forwards the attempted path to /auth/login as next_href", () => {
    cy.visit("/mfa");
    cy.url().should("include", "/auth/login");
    cy.url().should("include", "next_href=%2Fmfa");
  });

  it("redirects back to the attempted page after logging in", () => {
    const { email, password } = superuserCredentials();

    // Visiting a protected page while logged out bounces to the login
    // page with the destination preserved on the URL.
    cy.visit("/mfa");
    cy.url().should("include", "next_href=%2Fmfa");

    cy.intercept({ method: "POST", url: "**/api/auth/login", times: 1 }).as(
      "loginRequest",
    );
    fillAndSubmitLoginForm(email, password);
    cy.wait("@loginRequest", { timeout: 15000 })
      .its("response.statusCode")
      .should("eq", 200);

    cy.getCookie(RefreshTokenCookieName(AUTH_APP_ID), {
      timeout: 10000,
    }).should("exist");

    // The post-login redirect should land on the original destination,
    // not the default /account dashboard.
    cy.url({ timeout: 20000 }).should("include", "/mfa");
    cy.url().should("not.include", "/auth/login");
    cy.url().should("not.include", "/account");
  });

  it("ignores unsafe next_href values and falls back to /account", () => {
    const { email, password } = superuserCredentials();

    cy.visit(
      "/auth/login?next_href=" +
        encodeURIComponent("https://evil.example/phish"),
    );

    cy.intercept({ method: "POST", url: "**/api/auth/login", times: 1 }).as(
      "loginRequest",
    );
    fillAndSubmitLoginForm(email, password);
    cy.wait("@loginRequest", { timeout: 15000 })
      .its("response.statusCode")
      .should("eq", 200);

    cy.url({ timeout: 20000 }).should("include", "/account");
  });

  it("sends an already-authenticated user straight to next_href from /auth/login", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }

      cy.visit("/auth/login?next_href=%2Fmfa");
      cy.url({ timeout: 20000 }).should("include", "/mfa");
      cy.url().should("not.include", "/auth/login");
    });
  });
});
