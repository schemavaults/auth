// Covers the `admin_only_organization_creation` gate on the create-organization
// *page* (auth-server/src/app/(client)/(authenticated)/orgs/new/page.tsx):
// while the server setting is on, the server component redirects non-admins to
// /error?error=403&error_id=forbidden, and platform administrators still get
// the form.
//
// The API-level half of this gate (POST /api/organizations -> 403) is pinned by
// organizations/OrganizationApiValidation.cy.ts; the page-level redirect was
// uncovered, so a regression there would leave non-admins on a create form
// whose submit can only ever fail.

const SETTING = "admin_only_organization_creation" as const;

// Module marker: keeps this spec's top-level constants file-scoped.
export {};

/**
 * Flips the server setting as the superuser, leaving the browser signed out
 * again so the caller can sign in as whoever the test needs
 * (`cy.create_and_login_as_*_via_request()` assert nobody is signed in).
 */
function setAdminOnlyOrganizationCreation(value: boolean): void {
  cy.clearCookies();
  cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
    if (!ok) {
      throw new Error("Failed to create and login as superuser");
    }
    cy.request({
      method: "PATCH",
      url: `/api/admin/settings/${SETTING}`,
      body: { value },
    }).then((response) => {
      expect(response.status, `PATCH ${SETTING} = ${value}`).to.eq(200);
    });
    cy.clearCookies();
  });
}

describe("Create organization page (/orgs/new) with admin_only_organization_creation enabled", () => {
  beforeEach(() => {
    setAdminOnlyOrganizationCreation(true);
  });

  after(() => {
    // Restore the default so later specs can create organizations.
    setAdminOnlyOrganizationCreation(false);
  });

  it("redirects a non-admin user to the 403 forbidden error page", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          expect(loggedIn, "regular user login should succeed").to.be.true;

          cy.visit("/orgs/new", { failOnStatusCode: false });

          cy.url().should("include", "/error");
          cy.url().should("include", "error=403");
          cy.url().should("include", "error_id=forbidden");
          cy.contains("Create a new organization").should("not.exist");
        },
      );
    });
  });

  it("still serves the create form to a platform administrator", () => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) {
        throw new Error("Failed to create and login as superuser");
      }

      cy.visit("/orgs/new", { failOnStatusCode: false });

      cy.url().should("include", "/orgs/new");
      cy.url().should("not.include", "/error");
      cy.contains("Create a new organization").should("be.visible");
      cy.get('input[name="organization_id"]').should("exist");
    });
  });
});
