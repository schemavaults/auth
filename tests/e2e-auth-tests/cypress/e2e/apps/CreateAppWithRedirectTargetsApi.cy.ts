// POST /api/apps with `initial_domains` / `initial_callback_urls`
// (`schemaVaultsAppCreationRequestSchema` in @schemavaults/app-definitions):
//   - both are registered with the app, in the environments given; domains
//     are stored as their canonical origin;
//   - a non-origin domain, a callback URL with a fragment, a duplicate or
//     an unknown key is a 400 and creates nothing;
//   - a taken app id is a 409 and leaves the existing app's domains and
//     callback URLs untouched (the app row and its redirect configuration
//     are written in one transaction).

interface RefListResponse<T> {
  success: boolean;
  list?: T[];
}

interface DomainRef {
  domain: string;
  environment: string;
}

interface CallbackUrlRef {
  callback_url: string;
  environment: string;
}

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

const ENVIRONMENT: string = Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test";
const OTHER_ENVIRONMENT: string = ENVIRONMENT === "production" ? "staging" : "production";
const ORIGIN = "https://create-with-targets.example";

function randomAppId(): string {
  return `e2e-targets-${Math.random().toString(36).slice(2, 12)}`;
}

function appBody(app_id: string, extra: Record<string, unknown> = {}) {
  return {
    app_id,
    app_name: `Create with redirect targets ${app_id}`,
    app_description: "Created by CreateAppWithRedirectTargetsApi.cy.ts",
    created_at: Date.now(),
    public: false,
    hardcoded: false,
    web: true,
    ...extra,
  };
}

function listDomains(app_id: string): Cypress.Chainable<DomainRef[]> {
  return cy
    .request<RefListResponse<DomainRef>>({ method: "GET", url: `/api/apps/${app_id}/domains` })
    .then((response) => {
      expect(response.status, "list domains").to.eq(200);
      return cy.wrap(response.body.list ?? [], { log: false });
    });
}

function listCallbackUrls(app_id: string): Cypress.Chainable<CallbackUrlRef[]> {
  return cy
    .request<RefListResponse<CallbackUrlRef>>({ method: "GET", url: `/api/apps/${app_id}/callback-urls` })
    .then((response) => {
      expect(response.status, "list callback URLs").to.eq(200);
      return cy.wrap(response.body.list ?? [], { log: false });
    });
}

function expectRefusedAndNotCreated(body: Record<string, unknown>, label: string): void {
  cy.request<{ success: boolean }>({
    method: "POST",
    url: "/api/apps",
    body,
    failOnStatusCode: false,
  }).then((response) => {
    expect(response.status, label).to.eq(400);
    expect(response.body.success, `${label}: success flag`).to.eq(false);
  });
  cy.request({ method: "GET", url: `/api/apps/${body["app_id"]}`, failOnStatusCode: false })
    .its("status")
    .should("eq", 404);
}

describe("POST /api/apps with initial domains and callback URLs", () => {
  beforeEach(() => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      expect(ok, "superuser login").to.be.true;
    });
  });

  it("registers the domains and callback URLs with the app", () => {
    const app_id = randomAppId();
    cy.request({
      method: "POST",
      url: "/api/apps",
      body: appBody(app_id, {
        initial_domains: [
          // Stored as the canonical origin.
          { domain: "https://Create-With-Targets.example:443/", environment: ENVIRONMENT },
        ],
        initial_callback_urls: [
          { callback_url: `${ORIGIN}/auth/callback`, environment: ENVIRONMENT },
          { callback_url: `${ORIGIN}/auth/callback`, environment: OTHER_ENVIRONMENT },
          { callback_url: "http://127.0.0.1/callback", environment: ENVIRONMENT },
        ],
      }),
    })
      .its("status")
      .should("eq", 200);

    listDomains(app_id).then((domains) => {
      expect(domains.map(({ domain, environment }) => ({ domain, environment }))).to.deep.eq([
        { domain: ORIGIN, environment: ENVIRONMENT },
      ]);
    });
    listCallbackUrls(app_id).then((callback_urls) => {
      const registered = callback_urls
        .map(({ callback_url, environment }) => `${environment} ${callback_url}`)
        .sort();
      expect(registered).to.deep.eq(
        [
          `${ENVIRONMENT} ${ORIGIN}/auth/callback`,
          `${OTHER_ENVIRONMENT} ${ORIGIN}/auth/callback`,
          `${ENVIRONMENT} http://127.0.0.1/callback`,
        ].sort(),
      );
    });

    cy.request({ method: "DELETE", url: `/api/apps/${app_id}` }).its("status").should("eq", 200);
  });

  it("still creates an app without any (both lists are optional)", () => {
    const app_id = randomAppId();
    cy.request({ method: "POST", url: "/api/apps", body: appBody(app_id) })
      .its("status")
      .should("eq", 200);
    listDomains(app_id).should("have.length", 0);
    listCallbackUrls(app_id).should("have.length", 0);
    cy.request({ method: "DELETE", url: `/api/apps/${app_id}` }).its("status").should("eq", 200);
  });

  it("refuses invalid redirect configuration without creating the app", () => {
    expectRefusedAndNotCreated(
      appBody(randomAppId(), {
        initial_domains: [{ domain: `${ORIGIN}/a/path`, environment: ENVIRONMENT }],
      }),
      "domain with a path",
    );
    expectRefusedAndNotCreated(
      appBody(randomAppId(), {
        initial_domains: [{ domain: "create-with-targets.example", environment: ENVIRONMENT }],
      }),
      "domain without a scheme",
    );
    expectRefusedAndNotCreated(
      appBody(randomAppId(), {
        initial_callback_urls: [{ callback_url: `${ORIGIN}/cb#fragment`, environment: ENVIRONMENT }],
      }),
      "callback URL with a fragment",
    );
    expectRefusedAndNotCreated(
      appBody(randomAppId(), {
        initial_domains: [
          { domain: ORIGIN, environment: ENVIRONMENT },
          { domain: `${ORIGIN.toUpperCase()}/`, environment: ENVIRONMENT },
        ],
      }),
      "the same domain twice",
    );
    expectRefusedAndNotCreated(
      appBody(randomAppId(), {
        initial_callback_urls: [
          { callback_url: `${ORIGIN}/cb`, environment: ENVIRONMENT },
          { callback_url: `${ORIGIN}/cb`, environment: ENVIRONMENT },
        ],
      }),
      "the same callback URL twice",
    );
    expectRefusedAndNotCreated(
      appBody(randomAppId(), {
        initial_callback_urls: [{ callback_url: `${ORIGIN}/cb`, environment: "nowhere" }],
      }),
      "unknown environment",
    );
    expectRefusedAndNotCreated(
      appBody(randomAppId(), { callback_urls: [`${ORIGIN}/cb`] }),
      "unknown key",
    );
  });

  it("answers 409 for a taken app id and leaves that app's configuration untouched", () => {
    const app_id = randomAppId();
    cy.request({
      method: "POST",
      url: "/api/apps",
      body: appBody(app_id, {
        initial_domains: [{ domain: ORIGIN, environment: ENVIRONMENT }],
        initial_callback_urls: [{ callback_url: `${ORIGIN}/cb`, environment: ENVIRONMENT }],
      }),
    })
      .its("status")
      .should("eq", 200);

    cy.request({
      method: "POST",
      url: "/api/apps",
      failOnStatusCode: false,
      body: appBody(app_id, {
        initial_domains: [{ domain: "https://hijack.example", environment: ENVIRONMENT }],
        initial_callback_urls: [{ callback_url: "https://hijack.example/cb", environment: ENVIRONMENT }],
      }),
    })
      .its("status")
      .should("eq", 409);

    listDomains(app_id).then((domains) => {
      expect(domains.map((d) => d.domain)).to.deep.eq([ORIGIN]);
    });
    listCallbackUrls(app_id).then((callback_urls) => {
      expect(callback_urls.map((c) => c.callback_url)).to.deep.eq([`${ORIGIN}/cb`]);
    });

    cy.request({ method: "DELETE", url: `/api/apps/${app_id}` }).its("status").should("eq", 200);
  });
});
