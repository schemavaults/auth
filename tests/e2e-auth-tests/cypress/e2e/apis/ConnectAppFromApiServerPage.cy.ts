// ConnectAppFromApiServerPage.cy.ts
//
// Connecting a client application from the API server's own page, and
// marking a connection first-party as it is created:
//
//   1. On the API server detail page (/apis/:api_server_id), an
//      organization OWNER who is not a platform admin clicks "Connect
//      application" in the Connected Applications card, submits the dialog
//      (the API server field is pre-filled and locked; no first-party switch
//      is offered to them) and sees the app listed without a reload. A
//      read-only MEMBER of the organization sees the connection but no
//      button.
//   2. `POST /api/apis/{api_server_id}/connect_app/{client_app_id}` takes an
//      optional `{ "first_party": true }` body: platform administrators
//      only (403 for the owner of both sides, and nothing is connected),
//      never for a hardcoded API server (400), unknown keys refused (400);
//      the response says whether the new connection is first-party, and an
//      existing connection is left as it is (409).
//   3. A platform administrator turns on the dialog's "First-party
//      connection" switch from the API server page and from the app page
//      ("Connect API server"); both pages then show the "First-party" badge
//      and the first-party endpoint reports the flag.
//
// The meaning of a first-party connection (implicit consent) is covered by
// example_resource_server/FirstPartyConnection.cy.ts; connecting from the
// app's pages by ConnectAppToApiFromAppPages.cy.ts.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

interface ConnectResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
  first_party?: boolean;
  error?: string;
}

interface ConnectionStatusResponseBody {
  success: boolean;
  is_allowed: boolean;
}

interface FirstPartyResponseBody {
  success: boolean;
  first_party: boolean;
}

interface CreateInvitationResponseBody {
  success: boolean;
  data?: { invitation: { invitation_id: string } };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const dialogContentId = "connect-app-to-api-dialog-content";
const dialogContentSelector = `#${dialogContentId}`;
const connectFromApiPageButtonId = "connect-app-to-this-api-server-button";
const connectFromAppPageButtonId = "connect-app-to-api-server-button";
const firstPartySwitchSelector = '[data-testid="connect-app-to-api-first-party-switch"]';

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function signOutIfAuthenticated(): void {
  cy.is_authenticated().then((authenticated: boolean) => {
    if (authenticated) {
      cy.logout_via_request();
    }
  });
}

function loginAsSuperuser(): void {
  signOutIfAuthenticated();
  cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
    if (!ok) throw new Error("Failed to create and login as superuser");
  });
}

/** As the signed-in owner (or admin) of `organization_id`, by request. */
function createApp(organization_id: string, app_id: string, app_name: string): void {
  cy.request({
    method: "POST",
    url: "/api/apps",
    body: {
      app_id,
      app_name,
      app_description: "ConnectAppFromApiServerPage.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      web: true,
      owner_type: "organization",
      owner_organization_id: organization_id,
    },
  }).then((response) => expect(response.status, `create app ${app_id}`).to.eq(200));
}

/** As the signed-in owner (or admin) of `organization_id`, by request. */
function createApiServer(organization_id: string, api_server_id: string, api_server_name: string): void {
  cy.request({
    method: "POST",
    url: "/api/apis",
    body: {
      api_server_id,
      api_server_name,
      api_server_description: "ConnectAppFromApiServerPage.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      owner_type: "organization",
      owner_organization_id: organization_id,
    },
  }).then((response) => expect(response.status, `create API server ${api_server_id}`).to.eq(200));
}

function connect(
  api_server_id: string,
  client_app_id: string,
  body?: Record<string, unknown>,
): Cypress.Chainable<Cypress.Response<ConnectResponseBody>> {
  return cy.request<ConnectResponseBody>({
    method: "POST",
    url: `/api/apis/${api_server_id}/connect_app/${client_app_id}`,
    ...(body === undefined ? {} : { body }),
    failOnStatusCode: false,
  });
}

function expectConnected(api_server_id: string, client_app_id: string, expected: boolean): void {
  cy.request<ConnectionStatusResponseBody>(`/api/apis/${api_server_id}/connect_app/${client_app_id}`).then(
    (response) => {
      expect(response.status).to.eq(200);
      expect(response.body.is_allowed, `'${client_app_id}' connected to '${api_server_id}'`).to.eq(expected);
    },
  );
}

function expectFirstParty(api_server_id: string, client_app_id: string, expected: boolean): void {
  cy.request<FirstPartyResponseBody>(
    `/api/apis/${api_server_id}/connect_app/${client_app_id}/first-party`,
  ).then((response) => {
    expect(response.status).to.eq(200);
    expect(response.body.first_party, `'${client_app_id}' → '${api_server_id}' first-party`).to.eq(expected);
  });
}

// Cypress .type() can begin firing keydowns while Radix's dialog is still
// settling its open animation / focus scope, dropping characters. Type,
// check the full value landed, and retry otherwise (same guard as
// apps/ConnectAppToApiFromAppPages.cy.ts).
function typeIntoDialogInput(name: "client_app_id" | "api_server_id", value: string, attemptsLeft: number): void {
  const selector = `${dialogContentSelector} input[name="${name}"]`;
  cy.get(selector).should("be.visible").should("not.be.disabled").click().clear().type(value, { delay: 15 });
  cy.get(selector).then(($input) => {
    if ($input.val() !== value && attemptsLeft > 0) {
      cy.log(`'${name}' input value mismatch after typing ("${$input.val()}"); retrying`);
      typeIntoDialogInput(name, value, attemptsLeft - 1);
    }
  });
  cy.get(selector).should("have.value", value);
}

/**
 * Fills in the open connect dialog's unlocked field, sets the first-party
 * switch when asked to (it must be offered then), submits, and checks the
 * request and its 200 answer.
 */
function submitConnectDialog(opts: {
  api_server_id: string;
  client_app_id: string;
  locked: "api_server_id" | "client_app_id";
  first_party?: boolean;
}): void {
  const { api_server_id, client_app_id, locked } = opts;
  const lockedValue = locked === "api_server_id" ? api_server_id : client_app_id;
  cy.get(dialogContentSelector).should("be.visible");
  cy.get(`${dialogContentSelector} input[name="${locked}"]`)
    .should("have.value", lockedValue)
    .should("be.disabled");
  if (locked === "api_server_id") {
    typeIntoDialogInput("client_app_id", client_app_id, 3);
  } else {
    typeIntoDialogInput("api_server_id", api_server_id, 3);
  }

  if (opts.first_party) {
    cy.get(firstPartySwitchSelector)
      .should("be.visible")
      .should("have.attr", "data-state", "unchecked")
      .click();
    cy.get(firstPartySwitchSelector).should("have.attr", "data-state", "checked");
  }

  const alias = `connect-${api_server_id}-${client_app_id}`;
  cy.intercept({
    method: "POST",
    url: `**/api/apis/${api_server_id}/connect_app/${client_app_id}`,
    times: 1,
  }).as(alias);
  cy.get(`${dialogContentSelector} button[type="submit"]`).should("not.be.disabled").click();
  cy.wait(`@${alias}`, { timeout: 20000, requestTimeout: 20000 }).then((interception) => {
    const raw: unknown = interception.request.body;
    const sent: unknown = typeof raw === "string" && raw.length > 0 ? JSON.parse(raw) : raw;
    if (opts.first_party) {
      expect(sent, "the dialog asks for a first-party connection").to.deep.equal({ first_party: true });
    } else {
      expect(sent === undefined || sent === null || sent === "", "no body without the switch").to.eq(true);
    }
    expect(interception.response?.statusCode, "connect request").to.eq(200);
    expect((interception.response?.body as ConnectResponseBody | undefined)?.first_party).to.eq(
      opts.first_party === true,
    );
  });
  cy.get(dialogContentSelector).should("not.exist");
}

describe("Connecting an app from the API server page", () => {
  beforeEach(() => {
    cy.reset_rate_limit();
  });

  it("lets an org owner connect an app from the API server page (no first-party switch), and hides the button from a read-only member", () => {
    signOutIfAuthenticated();
    cy.generate_random_test_user_credentials().then((memberCredentials) => {
      cy.create_and_login_as_regular_user_via_request(memberCredentials).then((ok: boolean) => {
        expect(ok, "member registration").to.be.true;
      });
      cy.logout_via_request();

      cy.generate_random_test_user_credentials().then((ownerCredentials) => {
        cy.create_and_login_as_regular_user_via_request(ownerCredentials).then((ok: boolean) => {
          expect(ok, "owner registration").to.be.true;
        });
        cy.is_admin().then((isAdmin: boolean) => {
          expect(isAdmin, "the org owner must not be a platform admin").to.be.false;
        });

        const suffix = randomSuffix();
        const organization_id = `api-page-connect-${suffix}`;
        const app_id = `api-page-connect-app-${suffix}`;
        const app_name = `API Page Connect App ${suffix}`;
        const api_server_id = `api-page-connect-api-${suffix}`;

        cy.create_organization_via_request({ organization_id, name: `API Page Connect ${suffix}` });
        createApp(organization_id, app_id, app_name);
        createApiServer(organization_id, api_server_id, `API Page Connect API ${suffix}`);

        cy.visit(`/apis/${api_server_id}`);
        cy.url().should("include", `/apis/${api_server_id}`);
        cy.wait_for_page_hydration();
        cy.contains("Connected Applications").should("exist");
        cy.contains("No applications are currently connected to this API server.").should("exist");

        cy.open_dialog_with_button(connectFromApiPageButtonId, dialogContentId);
        // Only platform administrators may mark a connection first-party.
        cy.get(dialogContentSelector).should("be.visible");
        cy.get(firstPartySwitchSelector).should("not.exist");
        submitConnectDialog({ api_server_id, client_app_id: app_id, locked: "api_server_id" });

        // The page refreshes its server-rendered list after the dialog
        // succeeds, so the app shows up without a reload, without a badge.
        cy.contains("p", app_name, { timeout: 20000 }).scrollIntoView().should("be.visible");
        cy.get(`[data-testid="first-party-connection-badge-${app_id}"]`).should("not.exist");
        expectConnected(api_server_id, app_id, true);
        expectFirstParty(api_server_id, app_id, false);

        // Invite the member as a plain member and accept as them.
        cy.request<CreateInvitationResponseBody>({
          method: "POST",
          url: `/api/organizations/${organization_id}/invitations`,
          body: { input_mode: "email", identifier: memberCredentials.email },
        }).then((inviteResponse) => {
          expect(inviteResponse.status, "invite the member").to.eq(201);
          const invitation_id = inviteResponse.body.data?.invitation.invitation_id;
          if (!invitation_id) throw new Error("Expected an invitation_id");

          cy.logout_via_request();
          cy.login_via_request(memberCredentials.email, memberCredentials.password).then((ok: boolean) => {
            expect(ok, "member login").to.be.true;
          });
          cy.request({
            method: "PATCH",
            url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
            body: { action: "accept" },
          }).then((acceptResponse) => expect(acceptResponse.status, "accept the invitation").to.eq(200));

          cy.visit(`/apis/${api_server_id}`);
          cy.url().should("include", `/apis/${api_server_id}`);
          cy.wait_for_page_hydration();
          cy.contains("p", app_name).scrollIntoView().should("be.visible");
          cy.get(`button#${connectFromApiPageButtonId}`).should("not.exist");
          cy.contains("button", "Connect application").should("not.exist");
        });
        signOutIfAuthenticated();
      });
    });
  });

  it("only lets platform administrators mark a new connection first-party (request contract)", () => {
    const suffix = randomSuffix();
    const organization_id = `first-party-connect-${suffix}`;
    const app_id = `first-party-connect-app-${suffix}`;
    const owner_app_id = `first-party-connect-owner-app-${suffix}`;
    const api_server_id = `first-party-connect-api-${suffix}`;

    signOutIfAuthenticated();
    cy.generate_random_test_user_credentials()
      .then((credentials) => cy.create_and_login_as_regular_user_via_request(credentials))
      .then((ok: boolean) => expect(ok, "owner registration").to.be.true);
    cy.create_organization_via_request({ organization_id, name: `First-party connect ${suffix}` });
    createApp(organization_id, app_id, `First-party connect app ${suffix}`);
    createApp(organization_id, owner_app_id, `First-party connect owner app ${suffix}`);
    createApiServer(organization_id, api_server_id, `First-party connect API ${suffix}`);

    // The owner of both sides may connect them, but not first-party: the
    // request is refused before anything is written.
    connect(api_server_id, app_id, { first_party: true }).then((response) => {
      expect(response.status, "owner asks for first-party").to.eq(403);
      expect(response.body.success).to.eq(false);
      expect(response.body.message).to.include("platform administrators");
    });
    expectConnected(api_server_id, app_id, false);
    // `first_party: false` is the default, open to whoever may connect.
    connect(api_server_id, owner_app_id, { first_party: false }).then((response) => {
      expect(response.status, "owner connects with first_party: false").to.eq(200);
      expect(response.body.first_party).to.eq(false);
    });
    expectConnected(api_server_id, owner_app_id, true);
    expectFirstParty(api_server_id, owner_app_id, false);

    loginAsSuperuser();
    // Hardcoded API servers define no API scopes: never first-party.
    const hardcoded_api_server_id: string = getAuthServerAppIdFromCypressEnv();
    connect(hardcoded_api_server_id, app_id, { first_party: true }).then((response) => {
      expect(response.status, "first-party to a hardcoded API server").to.eq(400);
      expect(response.body.message).to.include("cannot be first-party");
    });
    expectConnected(hardcoded_api_server_id, app_id, false);
    // The body is strict.
    connect(api_server_id, app_id, { first_party: true, restrict_user_scopes: true }).then((response) => {
      expect(response.status, "unknown key").to.eq(400);
      expect(response.body.error).to.eq("validation_error");
    });
    expectConnected(api_server_id, app_id, false);

    // A platform administrator connects and marks it in one request.
    connect(api_server_id, app_id, { first_party: true }).then((response) => {
      expect(response.status, "admin connects first-party").to.eq(200);
      expect(response.body.success).to.eq(true);
      expect(response.body.resource_id).to.eq(api_server_id);
      expect(response.body.first_party).to.eq(true);
    });
    expectConnected(api_server_id, app_id, true);
    expectFirstParty(api_server_id, app_id, true);

    // An existing connection is left alone (marked with the first-party
    // endpoint instead).
    connect(api_server_id, owner_app_id, { first_party: true }).then((response) => {
      expect(response.status, "already connected").to.eq(409);
    });
    expectFirstParty(api_server_id, owner_app_id, false);

    cy.delete_organization({ organization_id });
    signOutIfAuthenticated();
  });

  it("lets a platform administrator mark the connection first-party from the dialog on the API server page and the app page", () => {
    const suffix = randomSuffix();
    const organization_id = `first-party-dialog-${suffix}`;
    const app_id = `first-party-dialog-app-${suffix}`;
    const app_name = `First-party dialog app ${suffix}`;
    const api_page_api = {
      api_server_id: `first-party-dialog-api-a-${suffix}`,
      api_server_name: `First-party dialog API A ${suffix}`,
    };
    const app_page_api = {
      api_server_id: `first-party-dialog-api-b-${suffix}`,
      api_server_name: `First-party dialog API B ${suffix}`,
    };

    loginAsSuperuser();
    cy.create_organization_via_request({ organization_id, name: `First-party dialog ${suffix}` });
    createApp(organization_id, app_id, app_name);
    createApiServer(organization_id, api_page_api.api_server_id, api_page_api.api_server_name);
    createApiServer(organization_id, app_page_api.api_server_id, app_page_api.api_server_name);

    // From the API server page.
    cy.visit(`/apis/${api_page_api.api_server_id}`);
    cy.url().should("include", `/apis/${api_page_api.api_server_id}`);
    cy.wait_for_page_hydration();
    cy.open_dialog_with_button(connectFromApiPageButtonId, dialogContentId);
    submitConnectDialog({
      api_server_id: api_page_api.api_server_id,
      client_app_id: app_id,
      locked: "api_server_id",
      first_party: true,
    });
    cy.get(`[data-testid="first-party-connection-badge-${app_id}"]`, { timeout: 20000 })
      .scrollIntoView()
      .should("be.visible")
      .and("contain.text", "First-party");
    expectFirstParty(api_page_api.api_server_id, app_id, true);

    // From the app page: the first connection carries the badge there too,
    // and "Connect API server" offers the same switch.
    cy.visit(`/apps/${app_id}`);
    cy.url().should("include", `/apps/${app_id}`);
    cy.wait_for_page_hydration();
    cy.get(`[data-testid="first-party-connection-badge-${api_page_api.api_server_id}"]`)
      .scrollIntoView()
      .should("be.visible");
    cy.open_dialog_with_button(connectFromAppPageButtonId, dialogContentId);
    submitConnectDialog({
      api_server_id: app_page_api.api_server_id,
      client_app_id: app_id,
      locked: "client_app_id",
      first_party: true,
    });
    cy.contains("p", app_page_api.api_server_name, { timeout: 20000 }).scrollIntoView().should("be.visible");
    cy.get(`[data-testid="first-party-connection-badge-${app_page_api.api_server_id}"]`)
      .scrollIntoView()
      .should("be.visible");
    expectFirstParty(app_page_api.api_server_id, app_id, true);

    // The switch starts off at every opening, and is not offered for a
    // hardcoded API server.
    cy.open_dialog_with_button(connectFromAppPageButtonId, dialogContentId);
    cy.get(firstPartySwitchSelector).should("be.visible").should("have.attr", "data-state", "unchecked");
    typeIntoDialogInput("api_server_id", getAuthServerAppIdFromCypressEnv(), 3);
    cy.get(firstPartySwitchSelector).should("not.exist");
    cy.get("body").type("{esc}");
    cy.get(dialogContentSelector).should("not.exist");

    cy.delete_organization({ organization_id });
    signOutIfAuthenticated();
  });
});
