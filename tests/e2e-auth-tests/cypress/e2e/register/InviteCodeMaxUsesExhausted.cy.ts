// An invite code carries a `max_uses` limit that is enforced inside the
// create-user transaction in
// auth-server/src/lib/auth-db/users/create-user.ts (the
// `countInviteCodeUsages(...) < max_uses` check). Existing specs only ever
// create single-use invite codes and consume them once, so the limit itself
// -- the guard that stops one leaked invite code from onboarding unlimited
// accounts -- had no end-to-end coverage.
//
// This spec covers exactly that: a `max_uses: 1` invite code that has already
// been redeemed must not be redeemable a second time.

export {};

const INVITE_CODE_LENGTH: number = 24;

/**
 * Creates an invite code with the supplied usage limit as the superuser, then
 * returns to an unauthenticated session so registration can be attempted.
 */
function createInviteCodeWithMaxUses(
  max_uses: number,
): Cypress.Chainable<string> {
  return cy
    .as_admin((): Cypress.Chainable<string> => {
      return cy
        .generate_random_code(INVITE_CODE_LENGTH)
        .then((invite_code: string): Cypress.Chainable<string> => {
          return cy
            .create_invite_code(invite_code, max_uses)
            .then((created: boolean): Cypress.Chainable<string> => {
              expect(
                created,
                `invite code '${invite_code}' should be created with max_uses=${max_uses}`,
              ).to.be.true;
              return cy.wrap(invite_code, { log: false });
            });
        });
    })
    .then((invite_code: string): Cypress.Chainable<string> => {
      // Drop the superuser session; registration must run unauthenticated.
      cy.logout();
      return cy.wrap(invite_code, { log: false });
    });
}

describe("Invite code max_uses enforcement", () => {
  it("rejects a registration using an invite code that has already reached its max_uses limit", () => {
    createInviteCodeWithMaxUses(1).then((invite_code: string) => {
      cy.generate_random_test_user_credentials().then((first_user) => {
        // First redemption consumes the single available use.
        cy.register_via_request(
          first_user.email,
          first_user.password,
          invite_code,
        ).then((first_status: number) => {
          expect(
            first_status,
            "the first registration with a fresh max_uses=1 invite code should succeed",
          ).to.equal(200);
          cy.logout();

          cy.generate_random_test_user_credentials().then((second_user) => {
            // Second redemption of the same code is the case under test.
            cy.register_via_request(
              second_user.email,
              second_user.password,
              invite_code,
            ).then((second_status: number) => {
              expect(
                second_status,
                "registering with an invite code whose max_uses limit is already reached should be rejected",
              ).to.be.gte(400);
              cy.is_authenticated().should(
                "equal",
                false,
                "no session should be established by the rejected registration",
              );

              // The create-user transaction must roll back entirely, so the
              // rejected email must not exist as an account.
              cy.login_via_request(
                second_user.email,
                second_user.password,
              ).then((logged_in: boolean) => {
                expect(
                  logged_in,
                  "no account should exist for a registration rejected by the invite code usage limit",
                ).to.be.false;
              });
            });
          });
        });
      });
    });
  });
});
