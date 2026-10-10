// Verifies the self-service organization creation page at `/orgs/new`
// (auth-server/src/app/(client)/(authenticated)/orgs/new/page.tsx, rendering
// `<CreateOrganizationForm />` from @schemavaults/auth-ui): a regular,
// non-administrator user may reach it, create an organization through the
// form, and is pushed to the new organization's page as its owner.
//
// This page had no E2E coverage. Every other organization-creation spec
// either goes through `POST /api/organizations` directly
// (`cy.create_organization_via_request`) or drives the ADMIN dialog on
// `/admin/organizations` (`cy.create_organization`, which asserts
// `cy.is_admin()` first). Neither exercises the route that ordinary users
// actually reach from the "Create organization" link on the account card,
// so a regression in that page's route guard (it 403s only while the
// `admin_only_organization_creation` server setting is on, which is off by
// default), in its `onSuccess` redirect to `/orgs/{organization_id}`, or in
// the creating user's owner membership would not be caught.
//
// Adjacent coverage: the admin dialog path is pinned by
// organizations/Organizations.cy.ts, the API-level
// `admin_only_organization_creation` refusal and the body validation by
// organizations/OrganizationApiValidation.cy.ts, and the unauthenticated
// redirect off `/orgs/*` by misc/UnauthenticatedRedirects.cy.ts.

interface MeOrganizationRoleResponseBody {
  success: boolean;
  message?: string;
  data?: {
    organization_id?: string;
    role?: string;
  };
}

describe("Organization creation page (/orgs/new)", () => {
  it("lets a non-admin user create an organization from the form and lands them on it as its owner", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          expect(loggedIn, "regular user login should succeed").to.be.true;

          // The page under test is reachable by non-administrators: assert
          // the precondition so a failure below cannot be mistaken for a
          // test-setup problem.
          cy.is_admin().then((isAdmin: boolean) => {
            expect(
              isAdmin,
              "the user creating the organization must NOT be a platform administrator",
            ).to.be.false;

            cy.generate_random_code(12).then((randomCode: string) => {
              // MAXIMUM_ORGANIZATION_ID_LENGTH is 32; this is 27 characters.
              const organization_id = `self-serve-org-${randomCode.toLowerCase()}`;
              const name = `Self Serve Org ${randomCode}`;

              cy.visit("/orgs/new");
              cy.url().should("include", "/orgs/new");
              cy.url().should("not.include", "/error");
              cy.url().should("not.include", "/login");
              cy.wait_for_page_hydration();

              // The page renders its own card around the shared form.
              cy.contains("Create a new organization").should("exist");

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

              cy.get("button#submit-create-organization-form-button")
                .should("exist")
                .should("not.be.disabled")
                .click();

              cy.wait("@createOrganizationRequest", {
                timeout: 20000,
                requestTimeout: 20000,
              }).then((interception) => {
                expect(
                  interception.response?.statusCode,
                  "POST /api/organizations from /orgs/new should succeed",
                ).to.equal(200);
              });

              // `onSuccess` pushes the router at the new organization's page.
              cy.url({ timeout: 20000 }).should(
                "include",
                `/orgs/${organization_id}`,
              );
              cy.url().should("not.include", "/error");

              // The organization detail page only renders for members, so
              // seeing the organization's name here also proves the creating
              // user passed its membership guard.
              cy.contains(name).should("exist");

              // The creator must be the organization's OWNER, not merely a
              // member: ownership is what lets them invite members and
              // delete the organization later.
              cy.request<MeOrganizationRoleResponseBody>({
                method: "GET",
                url: `/api/me/organizations/${organization_id}/role`,
                failOnStatusCode: false,
              }).then((response) => {
                expect(
                  response.status,
                  "the creator should have a membership role in the new organization",
                ).to.equal(200);
                expect(response.body).to.have.property("success", true);
                expect(
                  response.body.data?.organization_id,
                  "role lookup should answer for the organization just created",
                ).to.equal(organization_id);
                expect(
                  response.body.data?.role,
                  "the user who created the organization should be its owner",
                ).to.equal("owner");
              });

              // Cleanup: the creating user is an owner, so they may delete it.
              cy.delete_organization({ organization_id }).then((result) => {
                expect(
                  result.success,
                  "the owner should be able to delete the organization they created",
                ).to.be.true;
              });
            });
          });
        },
      );
    });
  });
});
