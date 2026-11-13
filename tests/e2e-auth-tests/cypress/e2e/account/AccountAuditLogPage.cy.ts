// The account audit log page (/account/audit-log, GET /api/me/audit-log):
// linked from /account, it lists the signed-in user's recorded events,
// newest first, including a refused sign-in with a wrong password.

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

describe("Account audit log page", () => {
  it("lists the account's sign-ins and a refused sign-in", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then((ok: boolean) => {
        expect(ok, "registration").to.be.true;
      });
      cy.logout();

      // A sign-in with a wrong password is refused, and recorded.
      cy.login_via_request(credentials.email, `${credentials.password}-wrong`).then((ok: boolean) => {
        expect(ok, "login with a wrong password").to.be.false;
      });
      cy.login_via_request(credentials.email, credentials.password).then((ok: boolean) => {
        expect(ok, "login").to.be.true;
      });

      cy.visit("/account");
      cy.get('[data-testid="view-account-audit-log-link"]').click();
      cy.location("pathname").should("eq", "/account/audit-log");

      cy.get('[data-testid="audit-log-card"]').should("be.visible");
      cy.get('[data-testid="audit-log-entry"]').should("have.length.at.least", 3);
      cy.get('[data-testid="audit-log-entry"]')
        .first()
        .should("have.attr", "data-event-type", "user.signed_in")
        .find('[data-testid="audit-log-entry-description"]')
        .should("contain.text", "You signed in");
      cy.get('[data-testid="audit-log-entry"][data-event-type="user.sign_in_failed"]')
        .should("have.length", 1)
        .find('[data-testid="audit-log-entry-description"]')
        .should("contain.text", "wrong password");
      // The address of a refused sign-in to the account is shown to its owner.
      cy.get('[data-testid="audit-log-entry"][data-event-type="user.sign_in_failed"]')
        .find('[data-testid="audit-log-entry-request"]')
        .should("contain.text", "From ");
      cy.get('[data-testid="audit-log-entry"][data-event-type="user.registered"]').should("have.length", 1);
    });
  });
});
