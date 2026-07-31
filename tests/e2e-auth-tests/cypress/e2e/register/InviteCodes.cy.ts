describe("Invite Codes", () => {
  it("unauthenticated users are redirected from the invite codes page", () => {
    cy.visit("/admin/invite_codes");
    cy.url().should("include", "/login");
  });

  it("pre-fills the invite code field from the ?invite_code= search param", () => {
    const invite_code: string = "MY_EXAMPLE_INVITE_CODE";
    cy.visit(`/auth/register?invite_code=${invite_code}`);
    cy.wait_for_page_hydration();
    cy.get("input[name='invite_code']")
      .should("exist")
      .should("have.value", invite_code);
  });

  it("ignores an ?invite_code= search param that fails the invite code format schema", () => {
    // Too short (< 8 characters) to satisfy the invite code format schema
    cy.visit("/auth/register?invite_code=bad");
    cy.wait_for_page_hydration();
    cy.get("input[name='invite_code']")
      .should("exist")
      .should("have.value", "");
  });

  it("can create a new invite code as a superuser", () => {
    cy.as_admin(() => {
      cy.is_admin().should("be.true", "Superuser should have admin privileges");

      const INVITE_CODE_LENGTH: number = 24;
      cy.generate_random_code(INVITE_CODE_LENGTH).then(
        (invite_code: string) => {
          if (typeof invite_code !== "string") {
            throw new TypeError(
              `Generated invite code is not a string, received type: '${typeof invite_code}'`,
            );
          } else if (invite_code.length !== INVITE_CODE_LENGTH) {
            throw new TypeError(
              `Generated invite code is not a string of the correct length! ` +
                `Expected length of '${INVITE_CODE_LENGTH}'', received length of '${invite_code.length}'`,
            );
          } else {
            cy.log(
              `Successfully generated random invite_code: '${invite_code}'`,
            );
          }

          const max_uses: number = 1;

          cy.create_invite_code(invite_code, max_uses).then(() => {
            cy.log(
              `Successfully created invite code '${invite_code}' with max uses ${max_uses}`,
            );
          });
        },
      );
      return cy.wrap(null, { log: false });
    });
  });
});
