// Verifies that a domain can be attached to an API server from the API
// server's own detail page (/apis/:api_server_id, "Connected Domains" card)
// and not only from the /apis list's row actions, and that the control is
// hidden for viewers with read-only access.
//
//   1. A global admin (the superuser) opens the detail page of an
//      organization-owned API server, clicks "Add domain" in the Connected
//      Domains card, submits the create-API-server-domain dialog, and sees
//      the new domain listed on the page (and returned by
//      GET /api/apis/:api_server_id/domains).
//   2. A regular MEMBER of the owner organization (role === "member") can
//      view the same detail page but must not see the "Add domain" button
//      nor the dialog — the same read-only gate the /apis table applies to
//      its "Add domain" row action, and the same one the POST handler
//      enforces (see apis/OrgMemberCannotAddApiServerDomain.cy.ts).

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

interface CreateApiServerResponseBody {
  success: boolean;
  message: string;
  resource_id?: string;
}

interface ListApiServerDomainsResponseBody {
  success: boolean;
  list: Array<{ domain: string; environment: string }>;
}

// Module marker: keeps this spec's top-level interfaces file-scoped so they
// do not collide with same-named interfaces in other spec files.
export {};

// crypto.randomUUID() is unavailable in the spec's browser context (the
// auth server is not served from a secure context in CI). Generate an
// RFC4122 v4 UUID with Math.random instead — the id feeds a `z.guid()`
// validator on the auth-server, so the format must be valid.
function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const addDomainButtonSelector = "button#add-api-server-domain-button";
const dialogContentSelector = "#create-api-server-domain-dialog-content";
const submitButtonSelector =
  "button#submit-create-api-server-domain-form-button";

// Cypress .type() can begin firing keydowns while Radix's dialog is still
// settling its open animation / focus scope, dropping the first character(s)
// into the controlled input. Focus the input first, then type, verify the
// full value landed, and clear-and-retype if any keystrokes were lost (same
// guard as apis/ApiServers.cy.ts).
function typeDomainIntoDialog(domain: string, attemptsLeft: number): void {
  cy.get('input[name="domain"]')
    .should("be.visible")
    .should("not.be.disabled")
    .click()
    .clear()
    .type(domain, { delay: 15 });
  cy.get('input[name="domain"]').then(($input) => {
    if ($input.val() !== domain && attemptsLeft > 0) {
      cy.log(
        `Domain input value mismatch after typing ("${$input.val()}"); retrying (${attemptsLeft} attempts left)`,
      );
      typeDomainIntoDialog(domain, attemptsLeft - 1);
    }
  });
  cy.get('input[name="domain"]').should("have.value", domain);
}

describe("Adding a domain from the API server detail page (/apis/:api_server_id)", () => {
  it("lets a manager add a domain from the Connected Domains card, and hides the control from a read-only org member", () => {
    cy.generate_random_test_user_credentials().then((memberCredentials) => {
      // 1. Create the member's account first so that the invitation lookup
      //    (which expects an existing user) can resolve their email to a uid.
      cy.create_and_login_as_regular_user_via_request(memberCredentials).then(
        (memberCreated: boolean) => {
          expect(memberCreated, "member user creation should succeed").to.be
            .true;
          cy.logout();

          // 2. Log in as the superuser (a global admin, so they manage every
          //    API server) and create an organization plus a private API
          //    server owned by it.
          cy.create_and_login_as_superuser_via_request().then(
            (adminLoggedIn: boolean) => {
              expect(adminLoggedIn, "superuser login should succeed").to.be
                .true;

              cy.generate_random_code(12).then((randomCode: string) => {
                const lowerCode = randomCode.toLowerCase();
                const organization_id = `api-detail-dom-${lowerCode}`;
                const api_server_id: string = generateV4Uuid();
                const api_server_name = `API Detail Domain ${randomCode}`;
                const domain = `https://api-detail-${lowerCode}.example.test`;

                cy.create_organization_via_request({
                  organization_id,
                  name: `API Detail Domain Org ${randomCode}`,
                }).then(() => {
                  cy.request<CreateApiServerResponseBody>({
                    method: "POST",
                    url: "/api/apis",
                    body: {
                      api_server_id,
                      api_server_name,
                      api_server_description: `API server for detail-page domain E2E test ${randomCode}`,
                      created_at: Date.now(),
                      public: false,
                      hardcoded: false,
                      owner_organization_id: organization_id,
                    },
                  }).then((createApiResp) => {
                    expect(
                      createApiResp.status,
                      "superuser should be able to create the org's private API server",
                    ).to.eq(200);
                    expect(createApiResp.body.resource_id).to.eq(api_server_id);

                    // 3. Open the detail page and add a domain from the
                    //    Connected Domains card. The button is gated on the
                    //    SSR-resolved access level, so it is present as soon
                    //    as the page hydrates.
                    cy.visit(`/apis/${api_server_id}`);
                    cy.url().should("include", `/apis/${api_server_id}`);
                    cy.wait_for_page_hydration();
                    cy.contains("Connected Domains").should("be.visible");
                    cy.contains(
                      "No domains are registered for the current environment",
                    ).should("be.visible");

                    cy.open_dialog_with_button(
                      "add-api-server-domain-button",
                      "create-api-server-domain-dialog-content",
                    );
                    cy.get(dialogContentSelector).should("be.visible");

                    typeDomainIntoDialog(domain, 3);

                    cy.intercept({
                      method: "POST",
                      url: `**/api/apis/${api_server_id}/domains`,
                      times: 1,
                    }).as("createApiServerDomainRequest");

                    cy.get(submitButtonSelector)
                      .should("exist")
                      .should("not.be.disabled")
                      .click();

                    cy.wait("@createApiServerDomainRequest", {
                      timeout: 20000,
                      requestTimeout: 20000,
                    }).then((interception) => {
                      cy.wrap(interception.response?.statusCode).should(
                        "eq",
                        200,
                        "Create API server domain request should return 200",
                      );
                    });

                    cy.get(dialogContentSelector).should("not.exist");

                    // The page refreshes its server-rendered domain list
                    // after the dialog succeeds, so the new domain shows up
                    // in the Connected Domains card (environment "test" is
                    // the dialog's default in the E2E environment, i.e. the
                    // current one). open_dialog_with_button scrolled the
                    // "Add domain" button towards the top of the layout's
                    // overflow-y-scroll container, and the new row renders
                    // above that button — potentially above the container's
                    // visible box, which Cypress reports as "clipped by a
                    // parent with overflow" (this is what failed on the app
                    // detail page, whose longer content lets the button scroll
                    // all the way up) — so bring the row into view before
                    // asserting visibility.
                    cy.contains("p", domain, { timeout: 20000 })
                      .scrollIntoView()
                      .should("be.visible");
                    cy.contains(
                      "No domains are registered for the current environment",
                    ).should("not.exist");

                    cy.request<ListApiServerDomainsResponseBody>(
                      `/api/apis/${api_server_id}/domains`,
                    ).then((listResponse) => {
                      expect(listResponse.status).to.eq(200);
                      expect(listResponse.body).to.have.property(
                        "success",
                        true,
                      );
                      expect(
                        listResponse.body.list.some(
                          (d) =>
                            d.domain === domain && d.environment === "test",
                        ),
                        "the list endpoint should return the domain added from the detail page",
                      ).to.be.true;
                    });

                    // 4. Invite the regular user to the organization as a
                    //    plain member (request-based, mirroring
                    //    apis/OrgMemberCannotAddApiServerDomain.cy.ts).
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
                        "superuser should be able to invite the member to the org",
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

                          // 5. As a read-only org member, the detail page is
                          //    viewable (the domain added above is listed)
                          //    but the "Add domain" control and its dialog
                          //    are absent.
                          cy.visit(`/apis/${api_server_id}`);
                          cy.url().should(
                            "include",
                            `/apis/${api_server_id}`,
                          );
                          cy.wait_for_page_hydration();
                          cy.contains("Connected Domains").should(
                            "be.visible",
                          );
                          // The row sits near the bottom edge of the default
                          // viewport, inside the layout's scroll container;
                          // scroll it into view rather than relying on the
                          // fold position.
                          cy.contains("p", domain)
                            .scrollIntoView()
                            .should("be.visible");
                          cy.get(addDomainButtonSelector).should("not.exist");
                          cy.contains("button", "Add domain").should(
                            "not.exist",
                          );
                          cy.get(dialogContentSelector).should("not.exist");
                        });
                      });
                    });
                  });
                });
              });
            },
          );
        },
      );
    });
  });
});
