// Exercises the example resource server's /api/* routes, which are served
// by @schemavaults/openapi-operations (see
// tests/example-nextjs-resource-server/src/lib/api/), and the /docs pages
// rendered by @schemavaults/openapi-docs-ui from the generated OpenAPI
// document. This is the trial run of both packages before the auth server
// adopts them.

interface OpenApiOperationObject {
  operationId?: string;
  security?: Record<string, string[]>[];
  "x-schemavaults-auth"?: {
    public: boolean;
    schemes: string[];
    routeGuard: "authenticated" | "admin" | null;
    requiredScopes: string[];
  };
}

interface OpenApiDocumentLike {
  openapi: string;
  info: { title: string; version: string };
  servers?: { url: string }[];
  paths: Record<string, Record<string, OpenApiOperationObject>>;
  components?: { securitySchemes?: Record<string, { type: string }> };
}

interface ErrorEnvelope {
  success: false;
  error: string;
  message: string;
  issues?: { location: string; path: string; message: string; code: string }[];
}

describe("OpenApiOperations (example resource server)", () => {
  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;

  it("serves the public health operation", () => {
    cy.request({ method: "GET", url: `${exampleAppOrigin}/api/health` }).then(
      (response: Cypress.Response<{ ok: true; environment: string; timestamp: number }>) => {
        expect(response.status).to.eq(200);
        expect(response.body.ok).to.eq(true);
        expect(response.body.environment).to.eq("test");
        expect(response.body.timestamp).to.be.a("number");
      },
    );
  });

  it("serves the generated OpenAPI document with SchemaVaults auth extensions", () => {
    cy.request({ method: "GET", url: `${exampleAppOrigin}/api/openapi.json` }).then(
      (response: Cypress.Response<OpenApiDocumentLike>) => {
        expect(response.status).to.eq(200);
        expect(response.body.openapi).to.eq("3.1.0");
        expect(response.body.info.title).to.eq("Example Next.js Resource Server API");
        // `servers` is derived from the request's Host header, not hardcoded.
        expect(response.body.servers?.[0]?.url).to.eq(exampleAppOrigin);
        expect(Object.keys(response.body.paths)).to.include.members([
          "/api/health",
          "/api/echo",
          "/api/ping",
          "/api/whoami",
          "/api/admin/ping",
          "/api/organizations/{organization_id}/greeting",
        ]);

        const ping = response.body.paths["/api/ping"]?.post;
        expect(ping, "POST /api/ping operation").to.exist;
        expect(ping?.security).to.deep.eq([
          { "schemavaults-access-token": [] },
          { "schemavaults-access-token-cookie": [] },
        ]);
        expect(ping?.["x-schemavaults-auth"]).to.deep.include({
          public: false,
          routeGuard: "authenticated",
          requiredScopes: [],
        });

        const adminPing = response.body.paths["/api/admin/ping"]?.get;
        expect(adminPing?.["x-schemavaults-auth"]?.routeGuard).to.eq("admin");

        const health = response.body.paths["/api/health"]?.get;
        expect(health?.["x-schemavaults-auth"]?.public).to.eq(true);
        expect(health?.security).to.deep.eq([]);

        expect(response.body.components?.securitySchemes).to.have.property(
          "schemavaults-access-token",
        );
        expect(
          response.body.components?.securitySchemes?.["schemavaults-access-token"]?.type,
        ).to.eq("http");
      },
    );
  });

  it("validates JSON request bodies against the declared zod schema", () => {
    cy.request({
      method: "POST",
      url: `${exampleAppOrigin}/api/echo`,
      body: { message: "hello", repeat: 2 },
    }).then((response: Cypress.Response<{ echoes: string[] }>) => {
      expect(response.status).to.eq(200);
      expect(response.body.echoes).to.deep.eq(["hello", "hello"]);
    });

    cy.request({
      method: "POST",
      url: `${exampleAppOrigin}/api/echo`,
      body: { message: "", repeat: 99 },
      failOnStatusCode: false,
    }).then((response: Cypress.Response<ErrorEnvelope>) => {
      expect(response.status).to.eq(400);
      expect(response.body.success).to.eq(false);
      expect(response.body.error).to.eq("validation_error");
      const paths = (response.body.issues ?? []).map((issue) => `${issue.location}.${issue.path}`);
      expect(paths).to.include.members(["body.message", "body.repeat"]);
    });

    cy.request({
      method: "POST",
      url: `${exampleAppOrigin}/api/echo`,
      headers: { "Content-Type": "text/plain" },
      body: "message=hello",
      failOnStatusCode: false,
    }).then((response: Cypress.Response<ErrorEnvelope>) => {
      expect(response.status).to.eq(415);
      expect(response.body.error).to.eq("unsupported_media_type");
    });
  });

  it("refuses protected operations without a credential", () => {
    cy.request({
      method: "POST",
      url: `${exampleAppOrigin}/api/ping`,
      failOnStatusCode: false,
    }).then((response: Cypress.Response<ErrorEnvelope>) => {
      expect(response.status).to.eq(401);
      expect(response.body).to.deep.eq({
        success: false,
        error: "unauthorized",
        message: "Authentication required",
      });
      expect(response.headers["www-authenticate"]).to.contain("Bearer");
    });

    cy.request({
      method: "GET",
      url: `${exampleAppOrigin}/api/whoami`,
      headers: { Authorization: "Bearer not-a-real-token" },
      failOnStatusCode: false,
    }).then((response: Cypress.Response<ErrorEnvelope>) => {
      expect(response.status).to.eq(401);
      expect(response.body.error).to.eq("invalid_token");
    });

    cy.request({
      method: "GET",
      url: `${exampleAppOrigin}/api/does-not-exist`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(404);
    });
  });

  it("renders the generated API docs index and operation pages", () => {
    cy.origin(exampleAppOrigin, { args: { exampleAppOrigin } }, ({ exampleAppOrigin }) => {
      cy.visit("/");
      cy.get('[data-testid="api-docs-link"]').click();
      cy.url({ timeout: 15000 }).should("include", "/docs");
      cy.contains("h1", "Example Next.js Resource Server API").should("be.visible");
      // Server URL resolved from the request, shown in the header
      cy.contains(exampleAppOrigin).should("be.visible");
      // Security schemes card
      cy.contains("Access token (Bearer)").should("be.visible");
      // Tag cards with the operation rows
      cy.contains("Account").should("be.visible");
      cy.contains("a", "/api/ping").should("be.visible").click();

      cy.url({ timeout: 15000 }).should("include", "/docs/post-api-ping");
      cy.contains("h1", "Authenticated ping").should("be.visible");
      cy.contains("Authentication & permissions").should("be.visible");
      cy.contains("Any authenticated user").should("be.visible");
      cy.contains("Responses").should("be.visible");
      cy.contains("Pong").should("be.visible");
      cy.contains("curl -X POST").should("be.visible");

      // Admin operation page shows the admin route guard
      cy.visit("/docs/get-api-admin-ping");
      cy.contains("h1", "Administrator ping").should("be.visible");
      cy.contains("Platform administrators only").should("be.visible");

      // Unknown operations 404. cy.request resolves relative URLs against
      // the Cypress baseUrl (the auth server), so be explicit.
      cy.request({ url: `${exampleAppOrigin}/docs/get-api-nope`, failOnStatusCode: false })
        .its("status")
        .should("eq", 404);
    });
  });

  it("resolves a real SchemaVaults access token via the Bearer header and the cookie", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) {
            throw new Error("Failed to create invite code");
          }

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `openapi-ops-test-${suffix}@example.com`;
            const password = "TestPassword123!";

            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              cy.origin(
                exampleAppOrigin,
                { args: { email, exampleAppOrigin } },
                ({ email, exampleAppOrigin }) => {
                // The account page's test button sends the SDK-acquired
                // access token as a Bearer header to POST /api/ping.
                cy.url({ timeout: 15000 }).should("include", "/account");
                cy.contains("button", "Fetch Protected /api/ping Route").click();
                cy.contains("Received response from /api/ping!", { timeout: 15000 }).should(
                  "be.visible",
                );
                cy.contains("Pong!").should("be.visible");

                // The first-party access token cookie set during the PKCE
                // flow satisfies the cookie auth scheme on its own.
                // Cypress attaches the cookies it holds for the request's
                // origin, so the absolute URL is what selects them.
                cy.request({ method: "GET", url: `${exampleAppOrigin}/api/whoami` }).then(
                  (
                    response: Cypress.Response<{
                      uid: string;
                      email: string | null;
                      admin: boolean;
                      scheme: string;
                      scope: string | null;
                    }>,
                  ) => {
                    expect(response.status).to.eq(200);
                    expect(response.body.email).to.eq(email);
                    expect(response.body.admin).to.eq(false);
                    expect(response.body.scheme).to.eq("schemavaults-access-token-cookie");
                  },
                );

                // A regular user is refused by the admin route guard.
                cy.request({
                  method: "GET",
                  url: `${exampleAppOrigin}/api/admin/ping`,
                  failOnStatusCode: false,
                }).then((response: Cypress.Response<ErrorEnvelope>) => {
                  expect(response.status).to.eq(403);
                  expect(response.body.error).to.eq("forbidden");
                });
                },
              );
            });
          });
        });
      });
    });
  });
});
