// Full lifecycle coverage of the client-secret management API, which
// previously had no E2E coverage at all (the confidential-client specs seed
// their secret through the test-only seeding route):
//   GET    /api/apps/[app_id]/client-secret   -> metadata only
//   POST   /api/apps/[app_id]/client-secret   -> generate (409 if one exists)
//   PUT    /api/apps/[app_id]/client-secret   -> rotate (old secret dies)
//   DELETE /api/apps/[app_id]/client-secret   -> remove (404 if none)
// Whether a secret actually authenticates is checked against the OIDC
// introspection endpoint with client_secret_basic, so rotation is proven to
// invalidate the previous secret rather than just returning a new string.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface ClientSecretMetadataResponseBody {
  success: boolean;
  message?: string;
  has_client_secret?: boolean;
  created_at?: number;
  updated_at?: number;
}

interface ClientSecretGenerationResponseBody {
  success: boolean;
  message?: string;
  client_secret?: string;
}

interface IntrospectionResponseBody {
  active?: boolean;
  error?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function randomAppId(): string {
  return `e2e-secret-${Math.random().toString(36).slice(2, 12)}`;
}

function loginAsFreshRegularUser(): Cypress.Chainable<boolean> {
  return cy
    .generate_random_test_user_credentials()
    .then((credentials) =>
      cy.create_and_login_as_regular_user_via_request(credentials),
    )
    .then((ok: boolean) => {
      expect(ok, "regular user registration + login").to.be.true;
      return ok;
    });
}

/** Creates a private, user-owned app for the current session via request. */
function createOwnApp(app_id: string): void {
  cy.request({
    method: "POST",
    url: "/api/apps",
    body: {
      app_id,
      app_name: `Client secret E2E ${app_id}`,
      app_description: "Created by AppClientSecretApi.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      web: true,
    },
  }).then((response) => {
    expect(response.status, "app creation").to.eq(200);
    expect(response.body.resource_id).to.eq(app_id);
  });
}

/** POST /api/oidc/introspect with client_secret_basic and a bogus token. */
function introspectWithSecret(
  client_id: string,
  client_secret: string,
): Cypress.Chainable<Cypress.Response<IntrospectionResponseBody>> {
  return cy.request<IntrospectionResponseBody>({
    method: "POST",
    url: "/api/oidc/introspect",
    form: true,
    body: { token: "not-a-real-token" },
    headers: {
      Authorization: `Basic ${btoa(`${client_id}:${client_secret}`)}`,
      Accept: "application/json",
    },
    failOnStatusCode: false,
  });
}

describe("App client secret API", () => {
  it("generates, rotates and removes a client secret for an app the caller manages", () => {
    const app_id = randomAppId();
    loginAsFreshRegularUser();
    createOwnApp(app_id);

    cy.request<ClientSecretMetadataResponseBody>({
      method: "GET",
      url: `/api/apps/${app_id}/client-secret`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.deep.equal({
        success: true,
        has_client_secret: false,
      });
    });

    cy.request<ClientSecretGenerationResponseBody>({
      method: "DELETE",
      url: `/api/apps/${app_id}/client-secret`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "delete with no secret").to.eq(404);
      expect(response.body.success).to.eq(false);
    });

    cy.request<ClientSecretGenerationResponseBody>({
      method: "POST",
      url: `/api/apps/${app_id}/client-secret`,
    }).then((created) => {
      expect(created.status).to.eq(200);
      expect(created.body.success).to.eq(true);
      const firstSecret = created.body.client_secret;
      expect(firstSecret, "plaintext client secret").to.be.a("string").and
        .not.be.empty;

      cy.request<ClientSecretMetadataResponseBody>({
        method: "GET",
        url: `/api/apps/${app_id}/client-secret`,
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.has_client_secret).to.eq(true);
        expect(response.body.created_at).to.be.a("number");
        expect(response.body.updated_at).to.be.a("number");
        // The secret itself must never be echoed back.
        expect(response.body).to.not.have.property("client_secret");
      });

      cy.request<ClientSecretGenerationResponseBody>({
        method: "POST",
        url: `/api/apps/${app_id}/client-secret`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "second POST").to.eq(409);
        expect(response.body.success).to.eq(false);
      });

      // The generated secret authenticates the app as a confidential client.
      introspectWithSecret(app_id, firstSecret as string).then((response) => {
        expect(response.status, "introspect with new secret").to.eq(200);
        expect(response.body.active).to.eq(false);
      });

      cy.request<ClientSecretGenerationResponseBody>({
        method: "PUT",
        url: `/api/apps/${app_id}/client-secret`,
      }).then((rotated) => {
        expect(rotated.status).to.eq(200);
        const secondSecret = rotated.body.client_secret;
        expect(secondSecret).to.be.a("string").and.not.eq(firstSecret);

        introspectWithSecret(app_id, firstSecret as string).then((response) => {
          expect(response.status, "old secret after rotation").to.eq(401);
          expect(response.body.error).to.eq("invalid_client");
        });
        introspectWithSecret(app_id, secondSecret as string).then((response) => {
          expect(response.status, "new secret after rotation").to.eq(200);
        });
      });
    });

    cy.request<ClientSecretGenerationResponseBody>({
      method: "DELETE",
      url: `/api/apps/${app_id}/client-secret`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
    });

    cy.request<ClientSecretMetadataResponseBody>({
      method: "GET",
      url: `/api/apps/${app_id}/client-secret`,
    }).then((response) => {
      expect(response.body.has_client_secret).to.eq(false);
    });

    // PUT on an app without a secret creates one rather than failing.
    cy.request<ClientSecretGenerationResponseBody>({
      method: "PUT",
      url: `/api/apps/${app_id}/client-secret`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.client_secret).to.be.a("string");
    });
  });

  it("applies the same guards on every method: 400 malformed id, 403 hardcoded app, 404 unknown app, 403 non-manager", () => {
    const app_id = randomAppId();
    loginAsFreshRegularUser();
    createOwnApp(app_id);

    for (const method of ["GET", "POST", "PUT", "DELETE"] as const) {
      cy.request({
        method,
        url: "/api/apps/bad%20id/client-secret",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, `${method} malformed app id`).to.eq(400);
      });
      cy.request({
        method,
        url: `/api/apps/${AUTH_APP_ID}/client-secret`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, `${method} hardcoded app`).to.eq(403);
      });
      cy.request({
        method,
        url: "/api/apps/e2e-does-not-exist-xyz/client-secret",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, `${method} unknown app`).to.eq(404);
      });
    }

    // A different regular user cannot manage this user's app.
    cy.logout();
    loginAsFreshRegularUser();
    for (const method of ["GET", "POST", "PUT", "DELETE"] as const) {
      cy.request({
        method,
        url: `/api/apps/${app_id}/client-secret`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, `${method} by non-manager`).to.eq(403);
        expect(response.body).to.have.property("success", false);
      });
    }
  });
});
