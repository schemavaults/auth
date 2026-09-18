// Full lifecycle coverage of the explicit callback-URL allowlist API, which
// previously had no E2E coverage (RedirectUriValidation.cy.ts seeds its
// callback URLs through the test-only seeding route):
//   GET    /api/apps/[app_id]/callback-urls
//   POST   /api/apps/[app_id]/callback-urls
//   DELETE /api/apps/[app_id]/callback-urls/[app_callback_url_ref_id]

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface CallbackUrlRef {
  app_callback_url_ref_id: string;
  app_id: string;
  callback_url: string;
  environment: string;
  created_at: number;
}

interface ListCallbackUrlsResponseBody {
  success: boolean;
  message?: string;
  list?: CallbackUrlRef[];
}

interface MutationResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

// crypto.randomUUID() is unavailable in the spec's browser context.
function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomAppId(): string {
  return `e2e-cb-${Math.random().toString(36).slice(2, 12)}`;
}

function loginAsFreshRegularUser(): void {
  cy.generate_random_test_user_credentials()
    .then((credentials) =>
      cy.create_and_login_as_regular_user_via_request(credentials),
    )
    .then((ok: boolean) => {
      expect(ok, "regular user registration + login").to.be.true;
    });
}

function createOwnApp(app_id: string): void {
  cy.request({
    method: "POST",
    url: "/api/apps",
    body: {
      app_id,
      app_name: `Callback URL E2E ${app_id}`,
      app_description: "Created by AppCallbackUrlsApi.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      web: true,
    },
  }).then((response) => {
    expect(response.status, "app creation").to.eq(200);
  });
}

function callbackUrlBody(
  app_id: string,
  callback_url: string,
): CallbackUrlRef {
  return {
    app_callback_url_ref_id: generateV4Uuid(),
    app_id,
    callback_url,
    environment: Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test",
    created_at: Date.now(),
  };
}

describe("App callback URLs API", () => {
  it("registers, lists and removes explicit callback URLs", () => {
    const app_id = randomAppId();
    loginAsFreshRegularUser();
    createOwnApp(app_id);

    cy.request<ListCallbackUrlsResponseBody>({
      method: "GET",
      url: `/api/apps/${app_id}/callback-urls`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      expect(response.body.list).to.deep.equal([]);
    });

    const first = callbackUrlBody(app_id, "https://client.example/oauth/cb");
    cy.request<MutationResponseBody>({
      method: "POST",
      url: `/api/apps/${app_id}/callback-urls`,
      body: first,
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      expect(response.body.resource_id).to.eq(first.app_callback_url_ref_id);
    });

    cy.request<ListCallbackUrlsResponseBody>({
      method: "GET",
      url: `/api/apps/${app_id}/callback-urls`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      const list = response.body.list ?? [];
      expect(list).to.have.length(1);
      expect(list[0]?.app_callback_url_ref_id).to.eq(
        first.app_callback_url_ref_id,
      );
      expect(list[0]?.callback_url).to.eq(first.callback_url);
      expect(list[0]?.app_id).to.eq(app_id);
      expect(list[0]?.environment).to.eq(first.environment);
    });

    // Same URL registered twice for the same environment is a conflict.
    cy.request<MutationResponseBody>({
      method: "POST",
      url: `/api/apps/${app_id}/callback-urls`,
      body: { ...first, app_callback_url_ref_id: generateV4Uuid() },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "duplicate callback URL").to.eq(409);
      expect(response.body.success).to.eq(false);
    });

    cy.request<MutationResponseBody>({
      method: "DELETE",
      url: `/api/apps/${app_id}/callback-urls/${first.app_callback_url_ref_id}`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
    });

    cy.request<ListCallbackUrlsResponseBody>({
      method: "GET",
      url: `/api/apps/${app_id}/callback-urls`,
    }).then((response) => {
      expect(response.body.list).to.deep.equal([]);
    });

    cy.request<MutationResponseBody>({
      method: "DELETE",
      url: `/api/apps/${app_id}/callback-urls/${first.app_callback_url_ref_id}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "delete already-removed ref").to.eq(404);
      expect(response.body.success).to.eq(false);
    });
  });

  it("validates the callback URL body", () => {
    const app_id = randomAppId();
    loginAsFreshRegularUser();
    createOwnApp(app_id);

    const cases: Array<{ label: string; body: Cypress.RequestBody }> = [
      {
        label: "app_id in body differs from the route",
        body: {
          ...callbackUrlBody(app_id, "https://client.example/cb"),
          app_id: "some-other-app-id",
        },
      },
      {
        label: "callback URL with a fragment",
        body: callbackUrlBody(app_id, "https://client.example/cb#fragment"),
      },
      {
        label: "callback URL that is not a URL",
        body: callbackUrlBody(app_id, "not a url"),
      },
      {
        label: "unknown fields (strict schema)",
        body: {
          ...callbackUrlBody(app_id, "https://client.example/cb"),
          unexpected: true,
        },
      },
      { label: "empty object", body: {} },
    ];
    for (const { label, body } of cases) {
      cy.request<MutationResponseBody>({
        method: "POST",
        url: `/api/apps/${app_id}/callback-urls`,
        body,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, label).to.eq(400);
        expect(response.body.success, label).to.eq(false);
      });
    }

    cy.request<MutationResponseBody>({
      method: "DELETE",
      url: `/api/apps/${app_id}/callback-urls/not-a-guid`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "malformed ref id").to.eq(400);
    });
  });

  it("guards management: 404 unknown app, 403 hardcoded app, 403 for a non-member of a private app", () => {
    const app_id = randomAppId();
    loginAsFreshRegularUser();
    createOwnApp(app_id);
    const ref = callbackUrlBody(app_id, "https://client.example/guarded");
    cy.request({
      method: "POST",
      url: `/api/apps/${app_id}/callback-urls`,
      body: ref,
    }).then((response) => expect(response.status).to.eq(200));

    cy.request({
      method: "GET",
      url: "/api/apps/e2e-does-not-exist-xyz/callback-urls",
      failOnStatusCode: false,
    }).then((response) => expect(response.status).to.eq(404));

    cy.request({
      method: "POST",
      url: `/api/apps/${AUTH_APP_ID}/callback-urls`,
      body: callbackUrlBody(AUTH_APP_ID, "https://client.example/x"),
      failOnStatusCode: false,
    }).then((response) => expect(response.status).to.eq(403));

    cy.request({
      method: "GET",
      url: "/api/apps/bad%20id/callback-urls",
      failOnStatusCode: false,
    }).then((response) => expect(response.status).to.eq(400));

    cy.logout();
    loginAsFreshRegularUser();
    cy.request({
      method: "GET",
      url: `/api/apps/${app_id}/callback-urls`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "list by non-member").to.eq(403);
    });
    cy.request({
      method: "POST",
      url: `/api/apps/${app_id}/callback-urls`,
      body: callbackUrlBody(app_id, "https://client.example/intruder"),
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "add by non-member").to.eq(403);
    });
    cy.request({
      method: "DELETE",
      url: `/api/apps/${app_id}/callback-urls/${ref.app_callback_url_ref_id}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "delete by non-member").to.eq(403);
    });
  });
});
