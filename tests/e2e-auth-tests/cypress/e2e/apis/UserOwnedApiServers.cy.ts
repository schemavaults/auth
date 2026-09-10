// Exercises the user-owned ownership mode for API servers
// (owner_type = 'user'; auth-server/src/lib/ownership/):
//
//   - a regular user (no organization memberships, not an admin) can create
//     an API server owned by their own account via POST /api/apis;
//   - the created definition reports owner_type/owner_uid and shows up in
//     GET /api/apis?list_apis_query_type=owned;
//   - the owning user can add a domain to it and connect their own
//     user-owned app to it (POST /api/apis/:api/connect_app/:app requires
//     ownership of both sides);
//   - a different regular user can neither read nor delete it (403);
//   - the owning user can delete it.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface CreateResourceResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
}

interface ApiServerDefinitionLike {
  api_server_id: string;
  owner_type?: string;
  owner_organization_id?: string | null;
  owner_uid?: string | null;
}

interface GetApiServerResponseBody {
  success: boolean;
  message?: string;
  api_server?: ApiServerDefinitionLike;
}

interface ListApiServersResponseBody {
  success: boolean;
  message?: string;
  list?: ApiServerDefinitionLike[];
}

interface WhoamiResponseBody {
  success: boolean;
  user?: { uid: string; admin?: boolean };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function whoamiUid(): Cypress.Chainable<string> {
  return cy
    .request<WhoamiResponseBody>({
      method: "GET",
      url: `/api/auth/whoami/${AUTH_APP_ID}`,
    })
    .then((response) => {
      expect(response.status).to.eq(200);
      const uid = response.body.user?.uid;
      if (typeof uid !== "string") {
        throw new Error("Expected whoami response to include user.uid");
      }
      return cy.wrap(uid, { log: false });
    });
}

describe("User-owned API servers", () => {
  it("a regular user can create, list, manage, connect and delete an API server owned by their own account", () => {
    cy.generate_random_test_user_credentials().then((ownerCredentials) => {
      cy.create_and_login_as_regular_user_via_request(ownerCredentials).then(
        (created: boolean) => {
          expect(created, "owner user creation should succeed").to.be.true;

          whoamiUid().then((owner_uid: string) => {
            cy.generate_random_code(10).then((randomCode: string) => {
              const api_server_id: string = generateV4Uuid();
              const app_id: string = generateV4Uuid();

              // 1. Create a user-owned API server
              cy.request<CreateResourceResponseBody>({
                method: "POST",
                url: "/api/apis",
                body: {
                  api_server_id,
                  api_server_name: `User Owned API ${randomCode}`,
                  api_server_description: `API for user-owned ownership E2E test ${randomCode}`,
                  created_at: Date.now(),
                  public: false,
                  hardcoded: false,
                  owner_type: "user",
                  owner_uid,
                },
              }).then((createResp) => {
                expect(
                  createResp.status,
                  "regular user should be able to create a user-owned API server",
                ).to.eq(200);
                expect(createResp.body).to.have.property("success", true);
                expect(createResp.body.resource_id).to.eq(api_server_id);
              });

              // 2. The definition reports the ownership explicitly
              cy.request<GetApiServerResponseBody>({
                method: "GET",
                url: `/api/apis/${api_server_id}`,
              }).then((getResp) => {
                expect(getResp.status).to.eq(200);
                expect(getResp.body.success).to.eq(true);
                const api = getResp.body.api_server;
                expect(api, "response should include the API server").to.exist;
                expect(api?.owner_type).to.eq("user");
                expect(api?.owner_uid).to.eq(owner_uid);
                expect(api?.owner_organization_id ?? null).to.eq(null);
              });

              // 3. It shows up in the owner's "owned" list
              cy.request<ListApiServersResponseBody>({
                method: "GET",
                url: "/api/apis?list_apis_query_type=owned",
              }).then((listResp) => {
                expect(listResp.status).to.eq(200);
                expect(listResp.body.success).to.eq(true);
                const ids = (listResp.body.list ?? []).map(
                  (a) => a.api_server_id,
                );
                expect(
                  ids,
                  "owned list should include the new API server",
                ).to.include(api_server_id);
              });

              // 4. The owner can manage it (add a domain) and list domains
              cy.request({
                method: "POST",
                url: `/api/apis/${api_server_id}/domains`,
                body: {
                  api_server_domain_ref_id: generateV4Uuid(),
                  api_server_id,
                  domain: `https://owned-api-${randomCode.toLowerCase()}.example.test`,
                  environment: "test",
                  created_at: Date.now(),
                  hardcoded: false,
                },
              }).then((domainResp) => {
                expect(
                  domainResp.status,
                  "owning user should be able to add a domain",
                ).to.eq(200);
                expect(domainResp.body).to.have.property("success", true);
              });
              cy.request({
                method: "GET",
                url: `/api/apis/${api_server_id}/domains`,
              }).then((listDomainsResp) => {
                expect(listDomainsResp.status).to.eq(200);
                expect(listDomainsResp.body).to.have.property("success", true);
              });

              // 5. Connect a user-owned app to the user-owned API server:
              //    the caller owns both sides, so this is allowed.
              cy.request<CreateResourceResponseBody>({
                method: "POST",
                url: "/api/apps",
                body: {
                  app_id,
                  app_name: `User Owned App For API ${randomCode}`,
                  app_description: `App for user-owned API connect E2E test ${randomCode}`,
                  created_at: Date.now(),
                  public: false,
                  hardcoded: false,
                  web: true,
                  owner_type: "user",
                  owner_uid,
                },
              }).then((createAppResp) => {
                expect(createAppResp.status).to.eq(200);
              });
              cy.request({
                method: "POST",
                url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
              }).then((connectResp) => {
                expect(
                  connectResp.status,
                  "owner of both app and API server should be able to connect them",
                ).to.eq(200);
                expect(connectResp.body).to.have.property("success", true);
              });
              cy.request<{ success: boolean; is_allowed?: boolean }>({
                method: "GET",
                url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
              }).then((permissionResp) => {
                expect(permissionResp.status).to.eq(200);
                expect(permissionResp.body.is_allowed).to.eq(true);
              });

              // 6. A different regular user cannot read or delete it
              cy.generate_random_test_user_credentials().then(
                (otherCredentials) => {
                  cy.logout();
                  cy.create_and_login_as_regular_user_via_request(
                    otherCredentials,
                  ).then((otherCreated: boolean) => {
                    expect(otherCreated, "other user creation should succeed")
                      .to.be.true;

                    cy.request<GetApiServerResponseBody>({
                      method: "GET",
                      url: `/api/apis/${api_server_id}`,
                      failOnStatusCode: false,
                    }).then((getResp) => {
                      expect(
                        getResp.status,
                        "another user must not be able to read a private user-owned API server",
                      ).to.eq(403);
                      expect(getResp.body).to.have.property("success", false);
                    });

                    cy.request({
                      method: "DELETE",
                      url: `/api/apis/${api_server_id}`,
                      failOnStatusCode: false,
                    }).then((deleteResp) => {
                      expect(
                        deleteResp.status,
                        "another user must not be able to delete a user-owned API server",
                      ).to.eq(403);
                    });

                    // 7. Back as the owner: delete both succeeds
                    cy.logout();
                    cy.login_via_request(
                      ownerCredentials.email,
                      ownerCredentials.password,
                    ).then((loggedIn: boolean) => {
                      expect(loggedIn, "owner should be able to log back in")
                        .to.be.true;

                      cy.request({
                        method: "DELETE",
                        url: `/api/apis/${api_server_id}`,
                      }).then((deleteResp) => {
                        expect(
                          deleteResp.status,
                          "owning user should be able to delete their API server",
                        ).to.eq(200);
                        expect(deleteResp.body).to.have.property(
                          "success",
                          true,
                        );
                      });
                      cy.request({
                        method: "DELETE",
                        url: `/api/apps/${app_id}`,
                      }).then((deleteResp) => {
                        expect(deleteResp.status).to.eq(200);
                      });
                    });
                  });
                },
              );
            });
          });
        },
      );
    });
  });
});
