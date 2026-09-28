// Pins the "Owner" field of the create API server dialog
// (`ResourceOwnershipPicker` in @schemavaults/auth-ui): the dialog states
// who will own the new API server instead of deriving it silently from the
// page it was opened on.
//
//   - a regular user without organizations gets "Personal" preselected on
//     /apis, sees "Organization" disabled with the reason, and never sees
//     "Platform"; the API server is created user-owned;
//   - an admin gets "Platform" preselected on /admin/apis; an organization
//     page preselects that organization and creates organization-owned API
//     servers.
//
// The server-side ownership rules themselves are covered by
// UserOwnedApiServers.cy.ts.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

const OPEN_BUTTON_ID = "open-create-api-server-dialog-button";
const DIALOG_CONTENT_ID = "create-api-server-dialog-content";
const SUBMIT_BUTTON_ID = "submit-create-api-server-form-button";
const OWNER = "create-api-server-owner";

interface ApiServerDefinitionLike {
  api_server_id: string;
  owner_type?: string;
  owner_organization_id?: string | null;
  owner_uid?: string | null;
}

interface CreateApiServerRequestBody {
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

/**
 * The client SDK sends its JSON bodies without a `Content-Type` (so they go
 * out as `text/plain`, see api_contract/TextPlainJsonBodies.cy.ts), and
 * Cypress only parses intercepted bodies labelled as JSON.
 */
function parseInterceptedBody(body: unknown): CreateApiServerRequestBody {
  return (typeof body === "string" ? JSON.parse(body) : body) as CreateApiServerRequestBody;
}

function ownerOption(owner_type: "user" | "organization" | "platform") {
  return cy.get(`[data-testid="${OWNER}-${owner_type}"]`);
}

function openCreateApiServerDialog(url: string): void {
  cy.visit(url);
  cy.wait_for_page_hydration();
  cy.open_dialog_with_button(OPEN_BUTTON_ID, DIALOG_CONTENT_ID);
}

/**
 * Fills the name/description, submits the dialog and yields the ownership
 * fields of the POST /api/apis request plus the created API server id.
 */
function submitCreateApiServerDialog(
  api_server_name: string,
): Cypress.Chainable<{ body: CreateApiServerRequestBody; api_server_id: string }> {
  cy.get(`input[name="api_server_name"]`)
    .should("not.be.disabled")
    .clear()
    .type(api_server_name);
  cy.get(`textarea[name="api_server_description"]`)
    .should("not.be.disabled")
    .clear()
    .type(`${api_server_name} (owner field E2E test)`);
  cy.intercept({ method: "POST", url: "**/api/apis", times: 1 }).as(
    "createApiServerRequest",
  );
  cy.get(`button#${SUBMIT_BUTTON_ID}`).should("not.be.disabled").click();
  return cy
    .wait("@createApiServerRequest", { timeout: 20000, requestTimeout: 20000 })
    .then((interception) => {
      expect(
        interception.response?.statusCode,
        "create API server status",
      ).to.eq(200);
      const api_server_id = interception.response?.body?.resource_id;
      expect(api_server_id, "created API server id").to.be.a("string");
      cy.get(`#${DIALOG_CONTENT_ID}`).should("not.exist");
      return cy.wrap(
        {
          body: parseInterceptedBody(interception.request.body),
          api_server_id: api_server_id as string,
        },
        { log: false },
      );
    });
}

function getApiServer(
  api_server_id: string,
): Cypress.Chainable<ApiServerDefinitionLike> {
  return cy
    .request<{ success: boolean; api_server?: ApiServerDefinitionLike }>({
      method: "GET",
      url: `/api/apis/${api_server_id}`,
    })
    .then((response) => {
      expect(response.status).to.eq(200);
      if (!response.body.api_server) {
        throw new Error(`GET /api/apis/${api_server_id} returned no API server`);
      }
      return cy.wrap(response.body.api_server, { log: false });
    });
}

describe("Create API server dialog: owner field", () => {
  it("creates a regular user's API server under their own account", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (created: boolean) => {
          expect(created, "regular user creation should succeed").to.be.true;

          cy.request<WhoamiResponseBody>({
            method: "GET",
            url: `/api/auth/whoami/${AUTH_APP_ID}`,
          }).then((whoami) => {
            const uid = whoami.body.user?.uid;
            expect(uid, "whoami uid").to.be.a("string");

            openCreateApiServerDialog("/apis");
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

            cy.generate_random_code(10).then((randomCode: string) => {
              submitCreateApiServerDialog(
                `Owner Field Personal API ${randomCode}`,
              ).then(({ body, api_server_id }) => {
                expect(body.owner_type).to.eq("user");
                expect(body.owner_uid).to.eq(uid);

                getApiServer(api_server_id).then((api) => {
                  expect(api.owner_type).to.eq("user");
                  expect(api.owner_uid).to.eq(uid);
                });

                cy.request({
                  method: "DELETE",
                  url: `/api/apis/${api_server_id}`,
                })
                  .its("status")
                  .should("eq", 200);
              });
            });
          });
        },
      );
    });
  });

  it("preselects the platform for admins, and an organization on its page", () => {
    cy.create_and_login_as_superuser_via_request().then((loggedIn: boolean) => {
      expect(loggedIn, "superuser login should succeed").to.be.true;

      openCreateApiServerDialog("/admin/apis");
      ownerOption("platform").should("have.attr", "data-state", "checked");
      ownerOption("user").should("not.be.disabled");
      cy.get(`[data-testid="${OWNER}-summary"]`).should(
        "have.attr",
        "data-owner-type",
        "platform",
      );

      cy.generate_random_code(10).then((randomCode: string) => {
        const organization_id = `owner-field-api-${randomCode.toLowerCase()}`;
        const organization_name = `Owner Field API Org ${randomCode}`;
        cy.create_organization_via_request({
          organization_id,
          name: organization_name,
        });

        openCreateApiServerDialog(`/orgs/${organization_id}`);
        ownerOption("organization").should(
          "have.attr",
          "data-state",
          "checked",
        );
        cy.get(`[data-testid="${OWNER}-organization-select"]`).should(
          "contain.text",
          organization_name,
        );

        submitCreateApiServerDialog(`Owner Field Org API ${randomCode}`).then(
          ({ body, api_server_id }) => {
            expect(body.owner_type).to.eq("organization");
            expect(body.owner_organization_id).to.eq(organization_id);

            getApiServer(api_server_id).then((api) => {
              expect(api.owner_type).to.eq("organization");
              expect(api.owner_organization_id).to.eq(organization_id);
            });
          },
        );
      });
    });
  });
});
