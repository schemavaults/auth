// Covers the standalone "create an organization" page at /orgs/new
// (auth-server/src/app/(client)/(authenticated)/orgs/new/page.tsx), the
// self-serve path a non-admin user takes to create their own organization.
//
// Every other organization-creation spec either posts to /api/organizations
// directly (cy.create_organization_via_request) or drives the admin-only
// dialog on /admin/organizations (cy.create_organization), so nothing
// exercised this page: neither its authenticated route guard nor the
// CreateOrganizationForm -> router.push(`/orgs/${organization_id}`) handoff
// that is supposed to land the creator on their brand new organization.

describe("Create organization page (/orgs/new)", () => {
  it("lets a non-admin user create an organization and lands them on its detail page", () => {
    cy.generate_random_code(8).then((randomCode: string) => {
      const organization_id = `selfserve-org-${randomCode.toLowerCase()}`;
      const name = `Self Serve Org ${randomCode}`;

      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request(credentials).then(
          (registered: boolean) => {
            expect(registered, "regular user registration should succeed").to.be
              .true;

            cy.visit("/orgs/new");
            cy.url().should("include", "/orgs/new");
            cy.wait_for_page_hydration();

            // The form is only rendered once the page's server component has
            // allowed a non-admin through the admin_only_organization_creation
            // check; a 403 would have redirected to /error instead.
            cy.url().should("not.include", "/error");

            cy.get('input[name="organization_id"]')
              .should("exist")
              .should("not.be.disabled")
              .type(organization_id);
            cy.get('input[name="name"]')
              .should("exist")
              .should("not.be.disabled")
              .type(name);

            cy.intercept({
              method: "POST",
              url: "**/api/organizations",
              times: 1,
            }).as("createOrganizationRequest");

            cy.get("button#submit-create-organization-form-button")
              .should("not.be.disabled")
              .click();

            cy.wait("@createOrganizationRequest", { timeout: 20000 }).then(
              (interception) => {
                expect(
                  interception.response?.statusCode,
                  "POST /api/organizations should succeed",
                ).to.equal(200);
              },
            );

            // On success the form calls onSuccess(organization_id), which
            // pushes the new organization's detail page.
            cy.url({ timeout: 20000 }).should(
              "include",
              `/orgs/${organization_id}`,
            );
            cy.url().should("not.include", "/error");
            cy.contains(name, { timeout: 20000 }).should("exist");

            // The creator owns the organization, so they can clean it up
            // themselves without borrowing admin credentials.
            cy.delete_organization({ organization_id }).then((result) => {
              expect(result.success, "owner should be able to delete the org").to
                .be.true;
            });
          },
        );
      });
    });
  });
});
