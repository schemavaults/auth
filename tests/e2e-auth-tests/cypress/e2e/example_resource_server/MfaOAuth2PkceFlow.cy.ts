// Verifies that an MFA-enrolled user completing a TOTP challenge from
// the OAuth2 PKCE redirect flow ends up back on the third-party
// resource server's /account page (not stranded on the auth server).
//
// Regression coverage for the MFA challenge page redirect: prior to
// the fix, MfaChallengePageView's onAuthenticated always pushed the
// user to /account on the auth server, dropping the OAuth2 callback
// for any third-party client.

describe("MFA OAuth2 PKCE redirect", () => {
  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;

  beforeEach(() => {
    cy.reset_rate_limit();
  });

  it("an MFA-enrolled user completing TOTP from the example resource server lands back on its /account", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) {
            throw new Error("Failed to create invite code");
          }

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `pkce-mfa-test-${suffix}@example.com`;
            const password = "TestPassword123!";

            // 1. Register through the PKCE flow to seed the account +
            //    authorize the example resource server app.
            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              // 2. Log out everywhere.
              cy.logout();

              // 3. Enroll the user in MFA out-of-band so the next login
              //    has to go through the TOTP challenge page.
              cy.enroll_test_user_mfa({ email }).then((mfa) => {
                cy.reset_rate_limit();

                // 4. Kick off the PKCE login flow from the resource
                //    server again, mirroring login_via_resource_server_pkce_flow.
                cy.clearAllCookies();
                cy.origin(exampleAppOrigin, () => {
                  localStorage.clear();
                  sessionStorage.clear();
                  cy.visit("/");
                  cy.contains(
                    "h1",
                    "@schemavaults/example-nextjs-resource-server",
                  );
                  cy.contains("button", "Login").click();
                });

                // 5. Auth-server /auth/login with PKCE params.
                cy.url({ timeout: 20_000 }).should("include", "/auth/login");
                cy.url().should("include", "code_challenge");
                cy.wait_for_page_hydration();

                cy.get("input[name='email']")
                  .should("be.visible")
                  .type(email, { force: true });
                cy.get("input[name='password']")
                  .should("be.visible")
                  .type(password, { force: true });
                cy.get("button[type='submit']")
                  .should("not.be.disabled")
                  .click();

                // 6. MFA challenge page must surface, and crucially, the
                //    OAuth2 PKCE redirect parameters must be carried
                //    forward on the URL so the post-MFA redirect can
                //    return the user to the third-party app.
                cy.url({ timeout: 15_000 }).should("include", "/auth/mfa");
                cy.url().should("include", "redirect_uri");
                cy.url().should("include", "challenge_time");
                cy.url().should(
                  "include",
                  "on_successful_authenticate=redirect-with-authorization-code",
                );
                cy.wait_for_page_hydration();

                cy.compute_totp_code(mfa.secret).then((code) => {
                  cy.get("[data-testid='mfa-challenge-input']", {
                    timeout: 10_000,
                  })
                    .should("be.visible")
                    .clear()
                    .type(code);
                  cy.get("[data-testid='mfa-challenge-submit']")
                    .should("not.be.disabled")
                    .click();
                });

                // 7. App was already authorized during registration, so
                //    the auth server should bounce straight back to the
                //    resource server's /account page after MFA verify.
                cy.origin(exampleAppOrigin, () => {
                  cy.url({ timeout: 30_000 }).should("include", "/account");
                  cy.contains("Example Account Page", {
                    timeout: 15_000,
                  }).should("be.visible");
                  cy.contains(
                    "If you're seeing this it means that you were not redirected because you are logged in!",
                  ).should("be.visible");
                });
              });
            });
          });
        });
      });
    });
  });

  it("an MFA-enrolled user completing the challenge with a recovery code lands back on the resource server", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) {
            throw new Error("Failed to create invite code");
          }

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `pkce-mfa-recovery-test-${suffix}@example.com`;
            const password = "TestPassword123!";

            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              cy.logout();

              cy.enroll_test_user_mfa({ email }).then((mfa) => {
                cy.reset_rate_limit();

                cy.clearAllCookies();
                cy.origin(exampleAppOrigin, () => {
                  localStorage.clear();
                  sessionStorage.clear();
                  cy.visit("/");
                  cy.contains("button", "Login").click();
                });

                cy.url({ timeout: 20_000 }).should("include", "/auth/login");
                cy.wait_for_page_hydration();

                cy.get("input[name='email']")
                  .should("be.visible")
                  .type(email, { force: true });
                cy.get("input[name='password']")
                  .should("be.visible")
                  .type(password, { force: true });
                cy.get("button[type='submit']")
                  .should("not.be.disabled")
                  .click();

                cy.url({ timeout: 15_000 }).should("include", "/auth/mfa");
                cy.wait_for_page_hydration();

                cy.get("[data-testid='mfa-challenge-toggle-recovery']", {
                  timeout: 10_000,
                })
                  .should("be.visible")
                  .click();
                cy.get("[data-testid='mfa-challenge-input']")
                  .should("be.visible")
                  .clear()
                  .type(mfa.recovery_codes[0]!);
                cy.get("[data-testid='mfa-challenge-submit']")
                  .should("not.be.disabled")
                  .click();

                cy.origin(exampleAppOrigin, () => {
                  cy.url({ timeout: 30_000 }).should("include", "/account");
                  cy.contains("Example Account Page", {
                    timeout: 15_000,
                  }).should("be.visible");
                });
              });
            });
          });
        });
      });
    });
  });
});
