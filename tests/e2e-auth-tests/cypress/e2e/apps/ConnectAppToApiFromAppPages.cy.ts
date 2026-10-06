// Verifies that a client application can be connected to an API server from
// the app's side of the UI, not only from the API server's row actions:
//
//   1. On the organization page (/orgs/:id), an organization OWNER who is
//      not a platform admin opens the app's row actions in the
//      "Organization Client Applications" table, picks "Connect this app to
//      an API", and submits the dialog (the client app field is pre-filled
//      and locked) — mirroring the API servers table's "Connect App to this
//      API" action.
//   2. On the app detail page (/apps/:app_id), the same owner clicks
//      "Connect API server" in the Connected API Servers card, submits the
//      dialog, and sees the new API server listed without a reload.
//   3. A read-only MEMBER of the organization sees both connections on the
//      detail page but neither control (no row action on the org page, no
//      button on the detail page).

interface CreateResourceResponseBody {
  success: boolean;
  message: string;
  resource_id?: string;
}

interface CreateInvitationResponseBody {
  success: boolean;
  message: string;
  data?: {
    invitation: {
      invitation_id: string;
      organization_id: string;
      invitee_uid: string;
    };
  };
}

interface RespondToInvitationResponseBody {
  success: boolean;
  message: string;
}

interface ConnectionStatusResponseBody {
  success: boolean;
  is_allowed: boolean;
}

// Module marker: keeps this spec's top-level interfaces file-scoped so they
// do not collide with same-named interfaces in other spec files.
export {};

// crypto.randomUUID() is unavailable in the spec's browser context (the
// auth server is not served from a secure context in CI). Generate an
// RFC4122 v4 UUID with Math.random instead — the ids feed `z.guid()`
// validators on the auth-server, so the format must be valid.
function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const dialogContentSelector = "#connect-app-to-api-dialog-content";
const connectFromDetailPageButtonId = "connect-app-to-api-server-button";
const connectRowActionLabel = "Connect this app to an API";

// Cypress .type() can begin firing keydowns while Radix's dialog is still
// settling its open animation / focus scope, dropping the first character(s)
// into the input. Focus the input first, then type, verify the full value
// landed, and clear-and-retype if any keystrokes were lost (same guard as
// apps/AppDetailPageAddDomain.cy.ts).
function typeApiServerIdIntoDialog(
  api_server_id: string,
  attemptsLeft: number,
): void {
  cy.get(`${dialogContentSelector} input[name="api_server_id"]`)
    .should("be.visible")
    .should("not.be.disabled")
    .click()
    .clear()
    .type(api_server_id, { delay: 15 });
  cy.get(`${dialogContentSelector} input[name="api_server_id"]`).then(
    ($input) => {
      if ($input.val() !== api_server_id && attemptsLeft > 0) {
        cy.log(
          `API server id input value mismatch after typing ("${$input.val()}"); retrying (${attemptsLeft} attempts left)`,
        );
        typeApiServerIdIntoDialog(api_server_id, attemptsLeft - 1);
      }
    },
  );
  cy.get(`${dialogContentSelector} input[name="api_server_id"]`).should(
    "have.value",
    api_server_id,
  );
}

// Fills in the open connect dialog (whose client app field must already be
// locked to `client_app_id`) and submits it, expecting the connection to be
// created.
function submitConnectDialog(
  client_app_id: string,
  api_server_id: string,
): void {
  cy.get(dialogContentSelector).should("be.visible");
  cy.get(`${dialogContentSelector} input[name="client_app_id"]`)
    .should("have.value", client_app_id)
    .should("be.disabled");

  typeApiServerIdIntoDialog(api_server_id, 3);

  cy.intercept({
    method: "POST",
    url: `**/api/apis/${api_server_id}/connect_app/${client_app_id}`,
    times: 1,
  }).as(`connectRequest-${api_server_id}`);

  cy.get(`${dialogContentSelector} button[type="submit"]`)
    .should("exist")
    .should("not.be.disabled")
    .click();

  cy.wait(`@connectRequest-${api_server_id}`, {
    timeout: 20000,
    requestTimeout: 20000,
  }).then((interception) => {
    cy.wrap(interception.response?.statusCode).should(
      "eq",
      200,
      "Connect app to API server request should return 200",
    );
  });

  cy.get(dialogContentSelector).should("not.exist");
}

function expectConnected(client_app_id: string, api_server_id: string): void {
  cy.request<ConnectionStatusResponseBody>(
    `/api/apis/${api_server_id}/connect_app/${client_app_id}`,
  ).then((response) => {
    expect(response.status).to.eq(200);
    expect(
      response.body.is_allowed,
      `app should be connected to API server '${api_server_id}'`,
    ).to.be.true;
  });
}

function openAppRowActions(app_name: string): void {
  cy.contains("tr", app_name)
    .scrollIntoView()
    .should("be.visible")
    .within(() => {
      cy.get('[data-testid="app-actions-button"]').click();
    });
  // The dropdown menu renders in a portal outside the table row; confirm it
  // opened through an item every viewer gets.
  cy.contains('[role="menuitem"]', "View app details", {
    timeout: 10000,
  }).should("be.visible");
}

describe("Connecting an app to an API server from the app's pages", () => {
  it("lets an org owner connect from the org page's app row actions and the app detail page, and hides both controls from a read-only member", () => {
    cy.generate_random_test_user_credentials().then((memberCredentials) => {
      // 1. Create the member's account first so that the invitation lookup
      //    (which expects an existing user) can resolve their email.
      cy.create_and_login_as_regular_user_via_request(memberCredentials).then(
        (memberCreated: boolean) => {
          expect(memberCreated, "member user creation should succeed").to.be
            .true;
          cy.logout();

          cy.generate_random_test_user_credentials().then((ownerCredentials) => {
            // 2. A regular (non-admin) user creates an organization — and so
            //    becomes its owner — plus an app and two API servers in it.
            cy.create_and_login_as_regular_user_via_request(
              ownerCredentials,
            ).then((ownerCreated: boolean) => {
              expect(ownerCreated, "owner user creation should succeed").to.be
                .true;
              cy.is_admin().then((isAdmin: boolean) => {
                expect(isAdmin, "the org owner must not be a platform admin")
                  .to.be.false;
              });

              cy.generate_random_code(12).then((randomCode: string) => {
                const organization_id = `app-connect-api-${randomCode.toLowerCase()}`;
                const app_id: string = generateV4Uuid();
                const app_name = `Connect From App ${randomCode}`;
                const orgPageApi = {
                  api_server_id: generateV4Uuid(),
                  api_server_name: `Org Page Row API ${randomCode}`,
                };
                const detailPageApi = {
                  api_server_id: generateV4Uuid(),
                  api_server_name: `App Detail Page API ${randomCode}`,
                };

                cy.create_organization_via_request({
                  organization_id,
                  name: `Connect From App Org ${randomCode}`,
                }).then(() => {
                  cy.request<CreateResourceResponseBody>({
                    method: "POST",
                    url: "/api/apps",
                    body: {
                      app_id,
                      app_name,
                      app_description: `App for connect-from-app E2E test ${randomCode}`,
                      created_at: Date.now(),
                      public: false,
                      hardcoded: false,
                      web: true,
                      owner_organization_id: organization_id,
                    },
                  }).then((createAppResp) => {
                    expect(
                      createAppResp.status,
                      "the org owner should be able to create the org's app",
                    ).to.eq(200);
                    expect(createAppResp.body.resource_id).to.eq(app_id);
                  });

                  for (const api of [orgPageApi, detailPageApi]) {
                    cy.request<CreateResourceResponseBody>({
                      method: "POST",
                      url: "/api/apis",
                      body: {
                        ...api,
                        api_server_description: `API server for connect-from-app E2E test ${randomCode}`,
                        created_at: Date.now(),
                        public: false,
                        hardcoded: false,
                        owner_organization_id: organization_id,
                      },
                    }).then((createApiResp) => {
                      expect(
                        createApiResp.status,
                        "the org owner should be able to create the org's API server",
                      ).to.eq(200);
                    });
                  }

                  // 3. Org page: "Connect this app to an API" from the app's
                  //    row actions.
                  cy.visit(`/orgs/${organization_id}`);
                  cy.url().should("include", `/orgs/${organization_id}`);
                  cy.wait_for_page_hydration();
                  cy.contains("Organization Client Applications").should(
                    "exist",
                  );

                  openAppRowActions(app_name);
                  cy.contains('[role="menuitem"]', connectRowActionLabel, {
                    timeout: 20000,
                  })
                    .should("be.visible")
                    .click();

                  submitConnectDialog(app_id, orgPageApi.api_server_id);
                  expectConnected(app_id, orgPageApi.api_server_id);

                  // 4. App detail page: the connection made above is listed,
                  //    and "Connect API server" adds another one in place.
                  cy.visit(`/apps/${app_id}`);
                  cy.url().should("include", `/apps/${app_id}`);
                  cy.wait_for_page_hydration();
                  cy.contains("Connected API Servers").should("exist");
                  cy.contains("p", orgPageApi.api_server_name)
                    .scrollIntoView()
                    .should("be.visible");
                  cy.contains("p", detailPageApi.api_server_name).should(
                    "not.exist",
                  );

                  cy.open_dialog_with_button(
                    connectFromDetailPageButtonId,
                    "connect-app-to-api-dialog-content",
                  );
                  submitConnectDialog(app_id, detailPageApi.api_server_id);

                  // The page refreshes its server-rendered list after the
                  // dialog succeeds, so the new API server shows up without
                  // a reload.
                  cy.contains("p", detailPageApi.api_server_name, {
                    timeout: 20000,
                  })
                    .scrollIntoView()
                    .should("be.visible");
                  cy.contains("p", orgPageApi.api_server_name).should("exist");
                  expectConnected(app_id, detailPageApi.api_server_id);

                  // 5. Invite the member to the organization as a plain
                  //    member and accept as them.
                  cy.request<CreateInvitationResponseBody>({
                    method: "POST",
                    url: `/api/organizations/${organization_id}/invitations`,
                    body: {
                      input_mode: "email",
                      identifier: memberCredentials.email,
                    },
                  }).then((createInviteResp) => {
                    expect(
                      createInviteResp.status,
                      "the org owner should be able to invite the member",
                    ).to.eq(201);
                    const invitation_id =
                      createInviteResp.body.data?.invitation.invitation_id;
                    if (!invitation_id) {
                      throw new Error(
                        "Expected the create-invitation response to include an invitation_id",
                      );
                    }

                    cy.logout();
                    cy.login_via_request(
                      memberCredentials.email,
                      memberCredentials.password,
                    ).then((memberLoggedIn: boolean) => {
                      expect(memberLoggedIn, "member should be able to log in")
                        .to.be.true;

                      cy.request<RespondToInvitationResponseBody>({
                        method: "PATCH",
                        url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
                        body: { action: "accept" },
                      }).then((acceptResp) => {
                        expect(
                          acceptResp.status,
                          "member should be able to accept the invitation",
                        ).to.eq(200);

                        // 6. As a read-only member, the detail page lists
                        //    both connections but offers no connect button.
                        cy.visit(`/apps/${app_id}`);
                        cy.url().should("include", `/apps/${app_id}`);
                        cy.wait_for_page_hydration();
                        cy.contains("p", orgPageApi.api_server_name)
                          .scrollIntoView()
                          .should("be.visible");
                        cy.contains("p", detailPageApi.api_server_name).should(
                          "exist",
                        );
                        cy.get(`button#${connectFromDetailPageButtonId}`).should(
                          "not.exist",
                        );
                        cy.contains("button", "Connect API server").should(
                          "not.exist",
                        );

                        // ...and the org page's app row actions do not offer
                        // the connect action.
                        cy.visit(`/orgs/${organization_id}`);
                        cy.url().should("include", `/orgs/${organization_id}`);
                        cy.wait_for_page_hydration();
                        openAppRowActions(app_name);
                        cy.contains(
                          '[role="menuitem"]',
                          connectRowActionLabel,
                        ).should("not.exist");
                        cy.get(dialogContentSelector).should("not.exist");
                      });
                    });
                  });
                });
              });
            });
          });
        },
      );
    });
  });
});
