import { ERROR_MESSAGE_CATALOG } from "@schemavaults/auth-common";

describe("Disabled users cannot login", () => {
  it("blocks a previously-valid user from logging in after an admin disables them", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      // Step 1: Create a regular user and confirm they can log in normally.
      cy.create_and_login_as_regular_user(credentials).then(
        (success: boolean) => {
          expect(
            success,
            "create_and_login_as_regular_user should succeed",
          ).to.be.true;
          cy.logout();

          // Step 2: Become admin, look up the target user's uid from the
          // admin users list, then disable them via the admin API.
          cy.as_admin((): Cypress.Chainable<string> => {
            return cy
              .request({
                method: "GET",
                url: "/api/admin/users/list",
                failOnStatusCode: false,
              })
              .then((listResponse): Cypress.Chainable<string> => {
                expect(listResponse.status).to.equal(200);
                expect(listResponse.body.success).to.be.true;
                const users: Array<{ uid: string; email: string }> =
                  listResponse.body.data.users;
                const target = users.find(
                  (u) => u.email === credentials.email,
                );
                if (!target) {
                  throw new Error(
                    `Could not find newly-created user ${credentials.email} in admin users list`,
                  );
                }
                return cy.wrap(target.uid, { log: false });
              });
          }).then((target_uid: string) => {
            cy.request({
              method: "POST",
              url: `/api/admin/users/${target_uid}/disable`,
              failOnStatusCode: false,
            }).then((disableResponse) => {
              expect(disableResponse.status).to.equal(200);
              expect(disableResponse.body.success).to.be.true;
              expect(disableResponse.body.resource_id).to.equal(target_uid);
            });

            // Step 3: Log out of the admin session so we can attempt a fresh
            // login as the now-disabled user.
            cy.logout();
            cy.reset_rate_limit();

            // Step 4: Attempt to log in via the UI. Intercept the login
            // request so we can assert on the 403 + account_disabled message
            // the server returns, and confirm cy.login() reports failure.
            cy.intercept({
              method: "POST",
              url: "**/api/auth/login",
              times: 1,
            }).as("disabledLoginRequest");

            cy.login(credentials.email, credentials.password).then(
              (loginSuccess: boolean) => {
                expect(
                  loginSuccess,
                  "Login should be denied for a disabled user",
                ).to.be.false;
              },
            );

            cy.wait("@disabledLoginRequest", { timeout: 15000 }).then(
              (interception) => {
                expect(
                  interception.response?.statusCode,
                  "POST /api/auth/login should return 403 for disabled users",
                ).to.equal(403);
                expect(
                  interception.response?.body?.success,
                  "Login response body should report success: false",
                ).to.equal(false);
                expect(
                  interception.response?.body?.message,
                  "Login response should carry the account_disabled message",
                ).to.equal(ERROR_MESSAGE_CATALOG.account_disabled);
              },
            );

            // Step 5: Sanity-check that the disabled user is still stuck on
            // the login page and has no auth cookies.
            cy.url().should("include", "/auth/login");
            cy.is_authenticated().should("equal", false);
          });
        },
      );
    });
  });
});
