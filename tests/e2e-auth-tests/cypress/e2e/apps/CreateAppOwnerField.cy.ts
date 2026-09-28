// Pins the "Owner" field of the create app dialog (`ResourceOwnershipPicker`
// in @schemavaults/auth-ui): the dialog states who will own the new app
// instead of deriving it silently from the page it was opened on.
//
//   - a regular user without organizations gets "Personal" preselected on
//     /apps, sees "Organization" disabled with the reason, and never sees
//     "Platform";
//   - once they own an organization they can pick it (the only organization
//     is preselected), and the app is created organization-owned;
//   - an admin gets "Platform" preselected on /admin/apps and can switch to
//     "Personal"; an organization page preselects that organization.
//
// The server-side ownership rules themselves are covered by
// UserOwnedApps.cy.ts.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

const OPEN_BUTTON_ID = "open-create-app-dialog-button";
const DIALOG_CONTENT_ID = "create-app-dialog-content";
const SUBMIT_BUTTON_ID = "submit-create-app-form-button";
const OWNER = "create-app-owner";

interface AppDefinitionLike {
  app_id: string;
  owner_type?: string;
  owner_organization_id?: string | null;
  owner_uid?: string | null;
}

interface CreateAppRequestBody {
  owner_type?: string;
  owner_organization_id?: string | null;
  owner_uid?: string | null;
}

interface WhoamiResponseBody {
  success: boolean;
  user?: { uid: string };
}

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

function ownerOption(owner_type: "user" | "organization" | "platform") {
  return cy.get(`[data-testid="${OWNER}-${owner_type}"]`);
}

function openCreateAppDialog(url: string): void {
  cy.visit(url);
  cy.wait_for_page_hydration();
  cy.open_dialog_with_button(OPEN_BUTTON_ID, DIALOG_CONTENT_ID);
}

/**
 * Fills the name/description, submits the dialog and yields the ownership
 * fields of the POST /api/apps request plus the created app id.
 */
function submitCreateAppDialog(
  app_name: string,
): Cypress.Chainable<{ body: CreateAppRequestBody; app_id: string }> {
  cy.get(`input[name="app_name"]`).should("not.be.disabled").clear().type(app_name);
  cy.get(`textarea[name="app_description"]`)
    .should("not.be.disabled")
    .clear()
    .type(`${app_name} (owner field E2E test)`);
  cy.intercept({ method: "POST", url: "**/api/apps", times: 1 }).as(
    "createAppRequest",
  );
  cy.get(`button#${SUBMIT_BUTTON_ID}`).should("not.be.disabled").click();
  return cy
    .wait("@createAppRequest", { timeout: 20000, requestTimeout: 20000 })
    .then((interception) => {
      expect(interception.response?.statusCode, "create app status").to.eq(200);
      const app_id = interception.response?.body?.resource_id;
      expect(app_id, "created app id").to.be.a("string");
      cy.get(`#${DIALOG_CONTENT_ID}`).should("not.exist");
      return cy.wrap(
        {
          body: interception.request.body as CreateAppRequestBody,
          app_id: app_id as string,
        },
        { log: false },
      );
    });
}

function getApp(app_id: string): Cypress.Chainable<AppDefinitionLike> {
  return cy
    .request<{ success: boolean; app?: AppDefinitionLike }>({
      method: "GET",
      url: `/api/apps/${app_id}`,
    })
    .then((response) => {
      expect(response.status).to.eq(200);
      if (!response.body.app) {
        throw new Error(`GET /api/apps/${app_id} returned no app`);
      }
      return cy.wrap(response.body.app, { log: false });
    });
}

describe("Create app dialog: owner field", () => {
  it("offers a regular user their own account, then an organization they own", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (created: boolean) => {
          expect(created, "regular user creation should succeed").to.be.true;

          // 1. No organizations: Personal only
          openCreateAppDialog("/apps");
          ownerOption("user")
            .should("have.attr", "data-state", "checked")
            .and("not.be.disabled");
          ownerOption("organization")
            .should("be.disabled")
            .and("contain.text", "You aren't a member of any organization");
          ownerOption("platform").should("not.exist");
          cy.get(`[data-testid="${OWNER}-summary"]`)
            .should("have.attr", "data-owner-type", "user")
            .and("contain.text", "your account");

          // 2. After creating an organization, pick it as the owner
          cy.generate_random_code(10).then((randomCode: string) => {
            const code = randomCode.toLowerCase();
            const organization_id = `owner-field-${code}`;
            const organization_name = `Owner Field Org ${randomCode}`;
            cy.create_organization_via_request({
              organization_id,
              name: organization_name,
            });

            openCreateAppDialog("/apps");
            ownerOption("organization")
              .should("not.be.disabled")
              .and("have.attr", "data-state", "unchecked")
              .click();
            ownerOption("organization").should(
              "have.attr",
              "data-state",
              "checked",
            );
            // The only organization is preselected.
            cy.get(`[data-testid="${OWNER}-organization-select"]`).should(
              "contain.text",
              organization_name,
            );
            cy.get(`[data-testid="${OWNER}-summary"]`)
              .should("have.attr", "data-owner-type", "organization")
              .and("contain.text", organization_name);

            submitCreateAppDialog(`Owner Field Org App ${randomCode}`).then(
              ({ body, app_id }) => {
                expect(body.owner_type).to.eq("organization");
                expect(body.owner_organization_id).to.eq(organization_id);
                expect(body.owner_uid ?? null).to.eq(null);

                getApp(app_id).then((app) => {
                  expect(app.owner_type).to.eq("organization");
                  expect(app.owner_organization_id).to.eq(organization_id);
                });

                cy.request({ method: "DELETE", url: `/api/apps/${app_id}` })
                  .its("status")
                  .should("eq", 200);
              },
            );
          });
        },
      );
    });
  });

  it("preselects the platform for admins, and an organization on its page", () => {
    cy.create_and_login_as_superuser_via_request().then((loggedIn: boolean) => {
      expect(loggedIn, "superuser login should succeed").to.be.true;

      cy.request<WhoamiResponseBody>({
        method: "GET",
        url: `/api/auth/whoami/${AUTH_APP_ID}`,
      }).then((whoami) => {
        const uid = whoami.body.user?.uid;
        expect(uid, "whoami uid").to.be.a("string");

        cy.generate_random_code(10).then((randomCode: string) => {
          // 1. The admin console preselects the platform; switch to Personal
          openCreateAppDialog("/admin/apps");
          ownerOption("platform").should("have.attr", "data-state", "checked");
          cy.get(`[data-testid="${OWNER}-summary"]`).should(
            "have.attr",
            "data-owner-type",
            "platform",
          );
          ownerOption("user").should("not.be.disabled").click();
          ownerOption("user").should("have.attr", "data-state", "checked");

          submitCreateAppDialog(`Owner Field Admin App ${randomCode}`).then(
            ({ body, app_id }) => {
              expect(body.owner_type).to.eq("user");
              expect(body.owner_uid).to.eq(uid);

              getApp(app_id).then((app) => {
                expect(app.owner_type).to.eq("user");
                expect(app.owner_uid).to.eq(uid);
              });

              cy.request({ method: "DELETE", url: `/api/apps/${app_id}` })
                .its("status")
                .should("eq", 200);
            },
          );

          // 2. An organization page preselects that organization
          const organization_id = `owner-field-admin-${randomCode.toLowerCase()}`;
          const organization_name = `Owner Field Admin Org ${randomCode}`;
          cy.create_organization_via_request({
            organization_id,
            name: organization_name,
          });
          openCreateAppDialog(`/orgs/${organization_id}`);
          ownerOption("organization").should(
            "have.attr",
            "data-state",
            "checked",
          );
          ownerOption("platform").should("not.be.disabled");
          cy.get(`[data-testid="${OWNER}-organization-select"]`).should(
            "contain.text",
            organization_name,
          );
          cy.get(`[data-testid="${OWNER}-summary"]`).should(
            "contain.text",
            organization_name,
          );
        });
      });
    });
  });
});
