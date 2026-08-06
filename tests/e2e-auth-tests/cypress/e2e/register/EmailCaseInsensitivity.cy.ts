// Emails are case-insensitive across register and login: an account
// registered with a mixed-case email must be reachable by any casing of the
// same address, and no second account may be registered under a different
// casing of an existing email.

function provisionInviteCodeIfRequired(): Cypress.Chainable<
  string | undefined
> {
  return cy
    .is_invite_code_required()
    .then((required: boolean): Cypress.Chainable<string | undefined> => {
      if (!required) {
        return cy.wrap<string | undefined>(undefined, { log: false });
      }
      return cy
        .as_admin((): Cypress.Chainable<string> => {
          return cy.generate_random_code(24).then((invite_code: string) => {
            return cy
              .create_invite_code(invite_code, 1)
              .then((created: boolean) => {
                if (!created) {
                  throw new Error(
                    "Failed to create invite code for duplicate-registration attempt!",
                  );
                }
                return cy.wrap(invite_code, { log: false });
              });
          });
        })
        .then((invite_code: string): Cypress.Chainable<string | undefined> => {
          cy.logout();
          return cy.wrap<string | undefined>(invite_code, { log: false });
        });
    });
}

describe("Email case-insensitivity", () => {
  it("treats email casing variants as the same account across register and login", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      const lowercase_email: string = credentials.email.toLowerCase();
      const [local_part, domain] = lowercase_email.split("@");
      // e.g. "Test-user-abc123@example.com"
      const mixed_case_email: string =
        local_part.charAt(0).toUpperCase() + local_part.slice(1) + "@" + domain;
      // e.g. "TEST-USER-ABC123@example.com"
      const upper_local_email: string =
        local_part.toUpperCase() + "@" + domain;

      // Register with the mixed-case variant (provisions an invite code if
      // the server currently requires one).
      cy.create_and_login_as_regular_user_via_request({
        email: mixed_case_email,
        password: credentials.password,
      }).then((registered: boolean) => {
        expect(registered, "registration with mixed-case email should succeed")
          .to.be.true;
        cy.logout();

        // The same mailbox must be able to log in with the all-lowercase form.
        cy.login_via_request(lowercase_email, credentials.password).then(
          (login_success: boolean) => {
            expect(
              login_success,
              "lowercase login should reach the account registered with mixed casing",
            ).to.be.true;
            cy.logout();

            // A different casing of the same address must not be able to
            // register a second account.
            provisionInviteCodeIfRequired().then(
              (invite_code: string | undefined) => {
                cy.register_via_request(
                  upper_local_email,
                  credentials.password,
                  invite_code,
                ).then((status: number) => {
                  expect(
                    status,
                    "duplicate registration under a different casing should be rejected as a conflict",
                  ).to.equal(409);
                  cy.is_authenticated().should("equal", false);
                });
              },
            );
          },
        );
      });
    });
  });
});
