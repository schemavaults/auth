// Verifies that the organization API endpoints reject authenticated-but-non-member
// requests with a 403 Forbidden response. These routes live under
// auth-server/src/app/api/organizations/[organization_id]/ and each performs its
// own authorization check separate from the authenticated-guard 401 case that is
// already covered by UnauthenticatedApiRequests.cy.ts.

describe("Non-Member Organization API Access", () => {
  // Creates an organization as the superuser, then logs that superuser out and
  // creates + logs in a fresh regular user who is NOT a member of the org.
  // Yields the organization_id once the regular user is authenticated.
  function setup_non_member_against_new_org(): Cypress.Chainable<string> {
    return cy
      .create_and_login_as_superuser_via_request()
      .then((adminLoggedIn: boolean) => {
        if (!adminLoggedIn) {
          throw new Error("Failed to create and login as superuser");
        }
        return cy.generate_random_code(12);
      })
      .then((randomCode: string) => {
        const organization_id = `nm-api-${randomCode.toLowerCase()}`;
        const name = `Non-Member API Org ${randomCode}`;
        return cy
          .create_organization_via_request({ organization_id, name })
          .then(() => cy.logout())
          .then(() => cy.generate_random_test_user_credentials())
          .then((credentials) =>
            cy
              .create_and_login_as_regular_user_via_request(credentials)
              .then((regularLoggedIn: boolean) => {
                if (!regularLoggedIn) {
                  throw new Error("Failed to create and login as regular user");
                }
                return cy.wrap(organization_id, { log: false });
              }),
          );
      });
  }

  it("GET /api/organizations/:org_id/members returns 403 for authenticated non-member", () => {
    setup_non_member_against_new_org().then((organization_id: string) => {
      cy.request({
        method: "GET",
        url: `/api/organizations/${organization_id}/members`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(403);
        expect(response.body).to.have.property("success", false);
      });
    });
  });

  it("GET /api/organizations/:org_id/invitations returns 403 for authenticated non-member", () => {
    setup_non_member_against_new_org().then((organization_id: string) => {
      cy.request({
        method: "GET",
        url: `/api/organizations/${organization_id}/invitations`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(403);
        expect(response.body).to.have.property("success", false);
      });
    });
  });

  it("POST /api/organizations/:org_id/invitations returns 403 for authenticated non-member", () => {
    setup_non_member_against_new_org().then((organization_id: string) => {
      cy.request({
        method: "POST",
        url: `/api/organizations/${organization_id}/invitations`,
        failOnStatusCode: false,
        body: {
          input_mode: "email",
          identifier: "not-a-real-invitee@example.com",
        },
      }).then((response) => {
        expect(response.status).to.eq(403);
        expect(response.body).to.have.property("success", false);
      });
    });
  });

  it("DELETE /api/organizations/:org_id returns 403 for authenticated non-member", () => {
    setup_non_member_against_new_org().then((organization_id: string) => {
      cy.request({
        method: "DELETE",
        url: `/api/organizations/${organization_id}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(403);
        expect(response.body).to.have.property("success", false);
      });
    });
  });
});
