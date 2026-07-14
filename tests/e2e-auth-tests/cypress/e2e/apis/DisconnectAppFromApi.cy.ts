// Verifies that DELETE /api/apis/:api_server_id/connect_app/:client_app_id
// actually revokes a previously-granted app-to-API-server permission for an
// authorized caller, and that the effect is reflected by the sibling GET
// endpoint on the same route (is_allowed transitions from `true` to `false`).
//
// The disconnect handler lives in
// auth-server/src/app/api/apis/[api_server_id]/connect_app/[client_app_id]/route.ts
// (`DELETE` export starting around line 270). Before this spec, the DELETE
// happy path had no E2E coverage at all — only the 401 unauthenticated case
// was exercised via misc/UnauthenticatedApiRequests.cy.ts. The parallel
// POST/connect happy path and its 403 authorization branches are covered by
// apis/ConnectAppToApi.cy.ts. This spec exercises the primary DELETE
// behavior end-to-end so that a regression that breaks
// `SchemaVaultsAppToApiPermissionsRegistry.revoke()` — or the handler's
// success response — surfaces immediately from the test name.

interface CreateAppResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
}

interface CreateApiServerResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
}

interface ConnectAppToApiResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
}

interface DisconnectAppFromApiResponseBody {
  success: boolean;
  message?: string;
}

interface GetAppToApiPermissionResponseBody {
  success: boolean;
  message?: string;
  is_allowed?: boolean;
}

// Module marker: keeps this spec's top-level interfaces file-scoped so they
// do not collide with same-named interfaces in other spec files.
export {};

// crypto.randomUUID() is unavailable in the spec's browser context (the auth
// server is not served from a secure context in CI; see
// apis/OrgMemberCannotAddApiServerDomain.cy.ts for the same workaround).
// Generate an RFC4122 v4 UUID with Math.random instead — both ids below feed
// into `z.string().uuid()` validators on the auth-server, so the format must
// be valid.
function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe("DELETE /api/apis/:api_server_id/connect_app/:client_app_id happy path", () => {
  it("revokes a previously-granted app-to-API permission for an authorized admin", () => {
    cy.create_and_login_as_superuser_via_request().then(
      (adminLoggedIn: boolean) => {
        expect(adminLoggedIn, "superuser login should succeed").to.be.true;

        cy.generate_random_code(12).then((randomCode: string) => {
          const lowerCode = randomCode.toLowerCase();
          const organization_id = `disc-app-api-${lowerCode}`;
          const name = `Disconnect App-API Org ${randomCode}`;

          cy.create_organization_via_request({ organization_id, name }).then(
            () => {
              // Create a private app owned by the org.
              const client_app_id: string = generateV4Uuid();
              cy.request<CreateAppResponseBody>({
                method: "POST",
                url: "/api/apps",
                body: {
                  app_id: client_app_id,
                  app_name: `Disc App ${randomCode}`,
                  app_description: `App for DELETE-disconnect E2E test ${randomCode}`,
                  created_at: Date.now(),
                  public: false,
                  hardcoded: false,
                  web: true,
                  owner_organization_id: organization_id,
                },
              }).then((createAppResp) => {
                expect(
                  createAppResp.status,
                  "superuser should be able to create the org's private app",
                ).to.eq(200);
                expect(createAppResp.body).to.have.property("success", true);
                expect(createAppResp.body.resource_id).to.eq(client_app_id);

                // Create a private API server owned by the same org.
                const api_server_id: string = generateV4Uuid();
                cy.request<CreateApiServerResponseBody>({
                  method: "POST",
                  url: "/api/apis",
                  body: {
                    api_server_id,
                    api_server_name: `Disc API ${randomCode}`,
                    api_server_description: `API server for DELETE-disconnect E2E test ${randomCode}`,
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
                  expect(createApiResp.body).to.have.property("success", true);
                  expect(createApiResp.body.resource_id).to.eq(api_server_id);

                  // Establish the connection so there is something to revoke.
                  // This is test SETUP for the DELETE case under test — the
                  // POST/connect happy path itself is covered by
                  // apis/ConnectAppToApi.cy.ts.
                  cy.request<ConnectAppToApiResponseBody>({
                    method: "POST",
                    url: `/api/apis/${api_server_id}/connect_app/${client_app_id}`,
                  }).then((connectResp) => {
                    expect(
                      connectResp.status,
                      "connect setup POST should succeed",
                    ).to.eq(200);
                    expect(connectResp.body).to.have.property("success", true);

                    // *** Behavior under test *** DELETE the connection.
                    cy.request<DisconnectAppFromApiResponseBody>({
                      method: "DELETE",
                      url: `/api/apis/${api_server_id}/connect_app/${client_app_id}`,
                    }).then((disconnectResp) => {
                      expect(
                        disconnectResp.status,
                        "DELETE on an existing connection should return 200",
                      ).to.eq(200);
                      expect(disconnectResp.body).to.have.property(
                        "success",
                        true,
                      );
                      expect(
                        String(
                          disconnectResp.body.message ?? "",
                        ).toLowerCase(),
                        "DELETE response should describe the disconnect",
                      ).to.include("disconnect");
                    });

                    // Effect verification: the sibling GET permission-check
                    // endpoint must now report `is_allowed: false`.
                    cy.request<GetAppToApiPermissionResponseBody>({
                      method: "GET",
                      url: `/api/apis/${api_server_id}/connect_app/${client_app_id}`,
                    }).then((getResp) => {
                      expect(
                        getResp.status,
                        "GET permission-check on the disconnected pairing should succeed",
                      ).to.eq(200);
                      expect(getResp.body).to.have.property("success", true);
                      expect(
                        getResp.body.is_allowed,
                        "app must no longer be permitted to call the API server after DELETE",
                      ).to.eq(false);
                    });
                  });
                });
              });
            },
          );
        });
      },
    );
  });
});
