export default function is_invite_code_required(): Cypress.Chainable<boolean> {
  return cy.request("/api/config/invite_code_required").then((response) => {
    if (response.status !== 200) {
      throw new Error(
        "Failed to determine if an invite code is required for registration!",
      );
    } else {
      const body = response.body;
      if (!body.success || body.error || typeof body.data !== "boolean") {
        throw new Error(
          "Failed to parse server configuration for 'invite_code_required' from response!",
        );
      }
      const invite_code_required: boolean = body.data;
      return cy.wrap(invite_code_required, { log: false });
    }
  });
}
