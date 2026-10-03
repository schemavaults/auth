// Covers the create-organization page at /orgs/new
// (auth-server/src/app/(client)/(authenticated)/orgs/new/page.tsx +
// create-organization-page-view.tsx, rendering <CreateOrganizationForm /> from
// @schemavaults/auth-ui). No other spec visits this page: organizations are
// otherwise created either through POST /api/organizations directly
// (`cy.create_organization_via_request()`) or through the admin-only
// <CreateOrganizationDialog /> on /admin/organizations
// (`cy.create_organization()`), so the standalone page and the
// `router.push('/orgs/{id}')` its onSuccess handler performs were untested.
//
// Scope: one behaviour -- a signed-in *regular* (non-admin) user fills the
// form, the organization is created, and they land on its detail page. The
// unauthenticated redirect off this page lives in
// misc/UnauthenticatedRedirects.cy.ts, and the
// `admin_only_organization_creation` gate on the page in
// organizations/CreateOrganizationPageAdminOnlyGate.cy.ts.

const SUBMIT_BUTTON_ID = "submit-create-organization-form-button" as const;

// Module marker: keeps this spec's top-level constants file-scoped.
export {};

describe("Create organization page (/orgs/new)", () => {
  it("lets a regular user create an organization and routes them to its detail page", () => {
    cy.generate_random_code(8).then((randomCode: string) => {
      const organization_id = `e2e-neworg-${randomCode}`;
      const name = `E2E New Org ${randomCode}`;

      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request(credentials).then(
          (loggedIn: boolean) => {
            expect(loggedIn, "regular user login should succeed").to.be.true;

            cy.visit("/orgs/new");
            cy.url().should("include", "/orgs/new");
            cy.url().should("not.include", "/error");
            cy.wait_for_page_hydration();

            cy.contains("Create a new organization").should("be.visible");

            cy.get('input[name="organization_id"]')
              .should("exist")
              .should("not.be.disabled")
              .type(organization_id)
              .should("have.value", organization_id);
            cy.get('input[name="name"]')
              .should("exist")
              .should("not.be.disabled")
              .type(name)
              .should("have.value", name);

            cy.intercept({
              method: "POST",
              url: "**/api/organizations",
              times: 1,
            }).as("createOrganizationRequest");

            cy.get(`button#${SUBMIT_BUTTON_ID}`)
              .should("not.be.disabled")
              .click();

            cy.wait("@createOrganizationRequest", {
              timeout: 20000,
              requestTimeout: 20000,
            }).then((interception) => {
              expect(
                interception.response?.statusCode,
                "POST /api/organizations status",
              ).to.eq(200);
            });

            // The form's onSuccess handler routes to the new organization,
            // whose detail page the creating user may read as its owner.
            cy.url({ timeout: 20000 }).should(
              "include",
              `/orgs/${organization_id}`,
            );
            cy.url().should("not.include", "/error");
            cy.contains(name, { timeout: 20000 }).should("exist");

            // Cleanup: the creator is the organization's owner, so they may
            // delete it themselves.
            cy.delete_organization({ organization_id }).then((result) => {
              expect(result.success, "cleanup delete should succeed").to.eq(
                true,
              );
            });
          },
        );
      });
    });
  });
});
