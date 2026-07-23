// Covers the email-verification indicator on the account page's
// AccountDetailsCard (packages/auth-ui AccountCard): a red "Not verified" /
// green "Verified" status button next to the Email row that opens a dialog,
// from which an unverified user can re-send their verification email.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface EmailVerificationTokenResponseBody {
  success: boolean;
  token?: string;
}

describe("AccountCard email verification indicator", () => {
  it("shows 'Not verified' for a fresh user and can resend the verification email from the dialog", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          expect(
            loggedIn,
            "create_and_login_as_regular_user_via_request should succeed",
          ).to.be.true;

          cy.visit("/account");
          cy.wait_for_page_hydration();

          // Fresh registrations start with email_verified=false, so the
          // indicator next to the Email row should show the red x state.
          cy.get('[data-testid="email-verification-status-button"]')
            .should("be.visible")
            .and("contain.text", "Not verified");

          // Clicking the indicator opens the verification status dialog
          cy.get('[data-testid="email-verification-status-button"]').click();
          cy.get('[data-testid="email-verification-dialog-content"]')
            .should("be.visible")
            .and("contain.text", "has not been verified");

          cy.intercept({
            method: "POST",
            url: "**/api/auth/verify-email/request",
            times: 1,
          }).as("verifyRequest");

          cy.get('[data-testid="resend-verification-email-button"]')
            .should("be.visible")
            .click();

          cy.wait("@verifyRequest", { timeout: 15000 }).then(
            (interception) => {
              expect(interception.request.body).to.deep.equal({
                email: credentials.email,
              });
              expect(interception.response?.statusCode).to.equal(200);
            },
          );

          // Success toast appears and the dialog closes
          cy.contains("Check your email").should("be.visible");
          cy.get('[data-testid="email-verification-dialog-content"]').should(
            "not.exist",
          );
        },
      );
    });
  });

  it("shows 'Verified' for a verified user and the dialog offers no resend button", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          expect(
            loggedIn,
            "create_and_login_as_regular_user_via_request should succeed",
          ).to.be.true;
          cy.logout();

          // Promote the user's email to verified using the test-only token
          // endpoint + the public confirm endpoint, mirroring the real
          // verification flow rather than hand-mutating the DB.
          cy.request<EmailVerificationTokenResponseBody>({
            method: "GET",
            url: `/api/test/email-verification-token/${encodeURIComponent(
              credentials.email,
            )}`,
            failOnStatusCode: false,
          }).then((tokenResponse) => {
            expect(tokenResponse.status).to.equal(200);
            expect(tokenResponse.body.success).to.be.true;
            expect(tokenResponse.body.token).to.be.a("string");
            const token: string = tokenResponse.body.token as string;

            cy.request({
              method: "POST",
              url: "/api/auth/verify-email/confirm",
              body: { token },
              failOnStatusCode: false,
            }).then((confirmResponse) => {
              expect(confirmResponse.status).to.equal(200);
              expect(confirmResponse.body.success).to.be.true;
            });

            // Log back in so freshly-minted tokens carry email_verified=true
            cy.login(credentials.email, credentials.password).then(
              (loginSuccess: boolean) => {
                expect(loginSuccess, "login should succeed").to.be.true;

                cy.visit("/account");
                cy.wait_for_page_hydration();

                cy.get('[data-testid="email-verification-status-button"]')
                  .should("be.visible")
                  .and("contain.text", "Verified")
                  .and("not.contain.text", "Not verified");

                cy.get(
                  '[data-testid="email-verification-status-button"]',
                ).click();
                cy.get('[data-testid="email-verification-dialog-content"]')
                  .should("be.visible")
                  .and("contain.text", "has been verified");

                // A verified user has nothing to re-send
                cy.get(
                  '[data-testid="resend-verification-email-button"]',
                ).should("not.exist");

                cy.get(
                  '[data-testid="close-email-verification-dialog-button"]',
                ).click();
                cy.get('[data-testid="email-verification-dialog-content"]').should(
                  "not.exist",
                );
              },
            );
          });
        },
      );
    });
  });

  it("reflects verification on the account card immediately (no re-login) after confirming via the verify-email page", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          expect(
            loggedIn,
            "create_and_login_as_regular_user_via_request should succeed",
          ).to.be.true;

          cy.visit("/account");
          cy.wait_for_page_hydration();
          cy.get('[data-testid="email-verification-status-button"]')
            .should("be.visible")
            .and("contain.text", "Not verified");

          // Fetch a verification token (test-only endpoint), then walk the
          // real confirmation page while still logged in.
          cy.request<EmailVerificationTokenResponseBody>({
            method: "GET",
            url: `/api/test/email-verification-token/${encodeURIComponent(
              credentials.email,
            )}`,
            failOnStatusCode: false,
          }).then((tokenResponse) => {
            expect(tokenResponse.status).to.equal(200);
            expect(tokenResponse.body.token).to.be.a("string");
            const token: string = tokenResponse.body.token as string;

            cy.intercept({
              method: "POST",
              url: "**/api/auth/verify-email/confirm",
              times: 1,
            }).as("confirmVerify");
            // The confirm view triggers a client token refresh so re-minted
            // claims carry email_verified=true without a re-login.
            cy.intercept({
              method: "POST",
              url: `**/api/auth/token/refresh_token/${AUTH_APP_ID}`,
              times: 1,
            }).as("tokenRefresh");

            cy.visit(`/auth/verify-email?token=${token}`);

            cy.wait("@confirmVerify", { timeout: 15000 }).then(
              (interception) => {
                expect(interception.response?.statusCode).to.equal(200);
              },
            );
            cy.wait("@tokenRefresh", { timeout: 15000 }).then(
              (interception) => {
                expect(interception.response?.statusCode).to.equal(200);
              },
            );

            // Follow the page's own link back to the account page — no
            // logout/login cycle — and expect the fresh claims to show.
            cy.contains("Continue to your account").click();
            cy.url({ timeout: 15000 }).should("include", "/account");
            cy.wait_for_page_hydration();

            cy.get('[data-testid="email-verification-status-button"]')
              .should("be.visible")
              .and("contain.text", "Verified")
              .and("not.contain.text", "Not verified");
          });
        },
      );
    });
  });
});
