/**
 * Faster equivalent of cy.create_invite_code(): creates the invite code with
 * POST /api/admin/invite-codes instead of the /admin/invite_codes page.
 * Requires an administrator session.
 */
export default function createInviteCodeViaRequest(
  invite_code: string,
  max_uses: number,
): Cypress.Chainable<boolean> {
  return cy
    .request({
      method: "POST",
      url: "/api/admin/invite-codes",
      body: {
        invite_code,
        max_uses,
        created_at: Date.now(),
        description: `Invite code '${invite_code}' generated within Cypress E2E test`,
      },
      failOnStatusCode: false,
    })
    .then((response): boolean => {
      expect(
        response.status,
        `create invite code request status (${JSON.stringify(response.body)})`,
      ).to.eq(200);
      return true;
    });
}
