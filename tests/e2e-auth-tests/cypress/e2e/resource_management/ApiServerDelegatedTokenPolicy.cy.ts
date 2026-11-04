// An API server's DELEGATED-TOKEN POLICY (migration 00052): whether it
// accepts access tokens whose RFC 8693 actor (`act`) claim names someone
// acting on behalf of the user, e.g. a client app's agent. The auth server
// mints such tokens only for API servers that accept them, since resource
// servers on @schemavaults/auth-server-sdk < 0.39.0 reject any token
// carrying `act`.
//
//  - Every API server starts without delegated tokens; creation refuses
//    `accept_delegated_tokens: true`.
//  - PUT /api/apis/[api_server_id]/delegated-token-policy (the API server's
//    managers and platform administrators) turns it on and off.
//  - The API server definition reports it as `accept_delegated_tokens`.
//
// The API server is owned by an organization a regular user creates, so
// that user manages it without being a platform administrator.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

interface ApiServerResponseBody {
  success: boolean;
  message?: string;
  api_server?: { api_server_id: string; accept_delegated_tokens?: boolean };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

function setPolicy(
  api_server_id: string,
  body: Record<string, unknown>,
): Cypress.Chainable<Cypress.Response<ApiServerResponseBody>> {
  return cy.request<ApiServerResponseBody>({
    method: "PUT",
    url: `/api/apis/${api_server_id}/delegated-token-policy`,
    body,
    failOnStatusCode: false,
  });
}

function expectPolicy(api_server_id: string, expected: boolean): void {
  cy.request<ApiServerResponseBody>({ method: "GET", url: `/api/apis/${api_server_id}` })
    .its("body.api_server.accept_delegated_tokens")
    .should("eq", expected);
}

function createApiServer(
  api_server_id: string,
  owner_organization_id: string,
  extra: Record<string, unknown> = {},
): Cypress.Chainable<Cypress.Response<{ success: boolean; message?: string }>> {
  return cy.request<{ success: boolean; message?: string }>({
    method: "POST",
    url: "/api/apis",
    body: {
      api_server_id,
      api_server_name: `Delegated tokens ${api_server_id}`,
      api_server_description: "ApiServerDelegatedTokenPolicy.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      owner_type: "organization",
      owner_organization_id,
      ...extra,
    },
    failOnStatusCode: false,
  });
}

describe("API server delegated-token policy", () => {
  const organization_id = randomId("e2e-deleg-org");
  const api_server_id = randomId("e2e-deleg-api");
  let managerCredentials: { email: string; password: string };

  /** Signs in as the regular user who owns the API server's organization. */
  function loginAsManager(): void {
    cy.clearCookies();
    cy.login_via_request(managerCredentials.email, managerCredentials.password).then((ok: boolean) =>
      expect(ok, "manager login").to.be.true,
    );
  }

  before(() => {
    cy.clearCookies();
    cy.generate_random_test_user_credentials().then((credentials) => {
      managerCredentials = credentials;
      cy.create_and_login_as_regular_user_via_request(credentials).then((ok: boolean) =>
        expect(ok, "manager registration").to.be.true,
      );
      cy.create_organization_via_request({
        organization_id,
        name: `Delegated tokens ${organization_id}`,
      });
      createApiServer(api_server_id, organization_id).its("status").should("eq", 200);
    });
  });

  after(() => {
    cy.clearCookies();
    cy.create_and_login_as_superuser_via_request();
    cy.request({ method: "DELETE", url: `/api/apis/${api_server_id}`, failOnStatusCode: false });
    cy.request({ method: "DELETE", url: `/api/organizations/${organization_id}`, failOnStatusCode: false });
  });

  it("is off by default and reported on the API server", () => {
    loginAsManager();
    expectPolicy(api_server_id, false);
  });

  it("the API server's managers turn it on and off", () => {
    loginAsManager();
    setPolicy(api_server_id, { accept_delegated_tokens: true }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      expect(response.body.api_server?.accept_delegated_tokens).to.eq(true);
    });
    expectPolicy(api_server_id, true);

    setPolicy(api_server_id, { accept_delegated_tokens: false }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.api_server?.accept_delegated_tokens).to.eq(false);
    });
    expectPolicy(api_server_id, false);
  });

  it("refuses malformed bodies, hardcoded and unknown API servers", () => {
    loginAsManager();
    for (const body of [{}, { accept_delegated_tokens: "yes" }, { accept_delegated_tokens: true, extra: 1 }]) {
      setPolicy(api_server_id, body).its("status").should("eq", 400);
    }
    expectPolicy(api_server_id, false);

    cy.clearCookies();
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) =>
      expect(ok, "superuser login").to.be.true,
    );
    // The auth server's own API never accepts delegated tokens.
    setPolicy(AUTH_APP_ID, { accept_delegated_tokens: true })
      .its("status")
      .should("eq", 403);
    setPolicy(randomId("e2e-deleg-missing"), { accept_delegated_tokens: true })
      .its("status")
      .should("eq", 404);
  });

  it("only the API server's managers and platform administrators may change it", () => {
    cy.clearCookies();
    setPolicy(api_server_id, { accept_delegated_tokens: true }).its("status").should("eq", 401);

    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then((ok: boolean) =>
        expect(ok, "outsider registration").to.be.true,
      );
      setPolicy(api_server_id, { accept_delegated_tokens: true }).then((response) => {
        expect(response.status, "a user outside the owning organization").to.eq(403);
        expect(response.body.success).to.eq(false);
      });
    });

    cy.clearCookies();
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) =>
      expect(ok, "superuser login").to.be.true,
    );
    expectPolicy(api_server_id, false);
    setPolicy(api_server_id, { accept_delegated_tokens: true }).its("status").should("eq", 200);
    expectPolicy(api_server_id, true);
    setPolicy(api_server_id, { accept_delegated_tokens: false }).its("status").should("eq", 200);
  });

  it("no API server is created accepting delegated tokens", () => {
    loginAsManager();
    const refused = randomId("e2e-deleg-create-on");
    createApiServer(refused, organization_id, { accept_delegated_tokens: true }).then((response) => {
      expect(response.status).to.eq(400);
      expect(response.body.success).to.eq(false);
      expect(response.body.message).to.contain("delegated-token-policy");
    });
    cy.request({ method: "GET", url: `/api/apis/${refused}`, failOnStatusCode: false })
      .its("status")
      .should("eq", 404);

    const off = randomId("e2e-deleg-create-off");
    createApiServer(off, organization_id, { accept_delegated_tokens: false }).its("status").should("eq", 200);
    expectPolicy(off, false);
    cy.request({ method: "DELETE", url: `/api/apis/${off}`, failOnStatusCode: false });
  });

  it("the API server page's switch turns it on", () => {
    loginAsManager();
    cy.intercept({
      method: "PUT",
      url: `**/api/apis/${api_server_id}/delegated-token-policy`,
    }).as("savePolicy");
    cy.visit(`/apis/${api_server_id}`);
    // The switch is server-rendered: clicking it before hydration does nothing.
    cy.wait_for_page_hydration();
    // The card sits below the fold of the 1280x720 viewport, which Cypress
    // reports as "clipped by a parent with overflow": bring it into view
    // before asserting visibility.
    cy.get('[data-testid="api-server-delegated-tokens-card"]', { timeout: 20000 })
      .scrollIntoView()
      .should("be.visible");
    cy.get('[data-testid="accept-delegated-tokens-switch"]')
      .should("have.attr", "aria-checked", "false")
      .click();
    cy.get('[data-testid="accept-delegated-tokens-switch"]', { timeout: 20000 }).should(
      "have.attr",
      "aria-checked",
      "true",
    );
    // The switch flips at once and saves in the background: read the stored
    // policy only once the PUT has answered.
    cy.wait("@savePolicy").then((interception) => {
      expect(interception.request.body).to.deep.eq({ accept_delegated_tokens: true });
      expect(interception.response?.statusCode).to.eq(200);
    });
    expectPolicy(api_server_id, true);
    setPolicy(api_server_id, { accept_delegated_tokens: false }).its("status").should("eq", 200);
  });
});
