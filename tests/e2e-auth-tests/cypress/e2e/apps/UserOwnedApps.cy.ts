// Exercises the user-owned ownership mode for client applications
// (owner_type = 'user'; auth-server/src/lib/ownership/):
//
//   - a regular user (no organization memberships, not an admin) can create
//     an app owned by their own account via POST /api/apps, both by asking
//     for it explicitly (`owner_type: "user"`) and by sending no ownership
//     fields at all (the non-admin default);
//   - the created definition reports owner_type/owner_uid, and shows up in
//     GET /api/apps?list_apps_query_type=owned and =accessible (the list
//     behind the /apps page);
//   - the owning user can manage it (add a domain) and delete it;
//   - a different regular user can neither read nor delete it (403);
//   - a regular user cannot create platform-owned apps, nor apps owned by
//     some other user's account (403);
//   - an admin creating an app with no ownership fields still gets a
//     platform-owned app (the historical admin-console behaviour).

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface CreateAppResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
}

interface AppDefinitionLike {
  app_id: string;
  owner_type?: string;
  owner_organization_id?: string | null;
  owner_uid?: string | null;
  created_by?: string | null;
}

interface GetAppResponseBody {
  success: boolean;
  message?: string;
  app?: AppDefinitionLike;
}

interface ListAppsResponseBody {
  success: boolean;
  message?: string;
  list?: AppDefinitionLike[];
}

interface WhoamiResponseBody {
  success: boolean;
  user?: { uid: string; admin?: boolean };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

// crypto.randomUUID() is unavailable in the spec's browser context (the
// auth server is not served from a secure context in CI).
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

function appBody(app_id: string, code: string, extra: Record<string, unknown>) {
  return {
    app_id,
    app_name: `User Owned App ${code}`,
    app_description: `App for user-owned ownership E2E test ${code}`,
    created_at: Date.now(),
    public: false,
    hardcoded: false,
    web: true,
    ...extra,
  };
}

describe("User-owned client applications", () => {
  it("a regular user can create, list, manage and delete an app owned by their own account", () => {
    cy.generate_random_test_user_credentials().then((ownerCredentials) => {
      cy.create_and_login_as_regular_user_via_request(ownerCredentials).then(
        (created: boolean) => {
          expect(created, "owner user creation should succeed").to.be.true;

          whoamiUid().then((owner_uid: string) => {
            cy.generate_random_code(10).then((randomCode: string) => {
              const app_id: string = generateV4Uuid();

              // 1. Explicit user ownership
              cy.request<CreateAppResponseBody>({
                method: "POST",
                url: "/api/apps",
                body: appBody(app_id, randomCode, {
                  owner_type: "user",
                  owner_uid,
                  owner_organization_id: null,
                }),
              }).then((createResp) => {
                expect(
                  createResp.status,
                  "regular user should be able to create a user-owned app",
                ).to.eq(200);
                expect(createResp.body).to.have.property("success", true);
                expect(createResp.body.resource_id).to.eq(app_id);
              });

              // 2. The definition reports the ownership explicitly
              cy.request<GetAppResponseBody>({
                method: "GET",
                url: `/api/apps/${app_id}`,
              }).then((getResp) => {
                expect(getResp.status).to.eq(200);
                expect(getResp.body.success).to.eq(true);
                const app = getResp.body.app;
                expect(app, "response should include the app").to.exist;
                expect(app?.owner_type).to.eq("user");
                expect(app?.owner_uid).to.eq(owner_uid);
                expect(app?.owner_organization_id ?? null).to.eq(null);
                expect(app?.created_by).to.eq(owner_uid);
              });

              // 3. It shows up in the owner's "owned" list
              cy.request<ListAppsResponseBody>({
                method: "GET",
                url: "/api/apps?list_apps_query_type=owned",
              }).then((listResp) => {
                expect(listResp.status).to.eq(200);
                expect(listResp.body.success).to.eq(true);
                const ids = (listResp.body.list ?? []).map((a) => a.app_id);
                expect(ids, "owned list should include the new app").to.include(
                  app_id,
                );
              });

              // 3b. ...and in the "accessible" list that backs /apps
              cy.request<ListAppsResponseBody>({
                method: "GET",
                url: "/api/apps?list_apps_query_type=accessible",
              }).then((listResp) => {
                expect(listResp.status).to.eq(200);
                expect(listResp.body.success).to.eq(true);
                const ids = (listResp.body.list ?? []).map((a) => a.app_id);
                expect(
                  ids,
                  "accessible list should include the new app",
                ).to.include(app_id);
              });

              // 4. The owner can manage it (add a domain)
              cy.request({
                method: "POST",
                url: `/api/apps/${app_id}/domains`,
                body: {
                  app_domain_ref_id: generateV4Uuid(),
                  app_id,
                  domain: `https://owned-${randomCode.toLowerCase()}.example.test`,
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

              // 5. Sending no ownership fields as a non-admin also yields a
              //    user-owned app (the non-admin default).
              const implicit_app_id: string = generateV4Uuid();
              cy.request<CreateAppResponseBody>({
                method: "POST",
                url: "/api/apps",
                body: appBody(implicit_app_id, `${randomCode}i`, {}),
              }).then((createResp) => {
                expect(createResp.status).to.eq(200);
                expect(createResp.body.success).to.eq(true);
              });
              cy.request<GetAppResponseBody>({
                method: "GET",
                url: `/api/apps/${implicit_app_id}`,
              }).then((getResp) => {
                expect(getResp.status).to.eq(200);
                expect(getResp.body.app?.owner_type).to.eq("user");
                expect(getResp.body.app?.owner_uid).to.eq(owner_uid);
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

                    cy.request<GetAppResponseBody>({
                      method: "GET",
                      url: `/api/apps/${app_id}`,
                      failOnStatusCode: false,
                    }).then((getResp) => {
                      expect(
                        getResp.status,
                        "another user must not be able to read a private user-owned app",
                      ).to.eq(403);
                      expect(getResp.body).to.have.property("success", false);
                    });

                    cy.request({
                      method: "DELETE",
                      url: `/api/apps/${app_id}`,
                      failOnStatusCode: false,
                    }).then((deleteResp) => {
                      expect(
                        deleteResp.status,
                        "another user must not be able to delete a user-owned app",
                      ).to.eq(403);
                    });

                    cy.request<ListAppsResponseBody>({
                      method: "GET",
                      url: "/api/apps?list_apps_query_type=owned",
                    }).then((listResp) => {
                      expect(listResp.status).to.eq(200);
                      const ids = (listResp.body.list ?? []).map(
                        (a) => a.app_id,
                      );
                      expect(
                        ids,
                        "another user's owned list must not include the app",
                      ).to.not.include(app_id);
                    });

                    cy.request<ListAppsResponseBody>({
                      method: "GET",
                      url: "/api/apps?list_apps_query_type=accessible",
                    }).then((listResp) => {
                      expect(listResp.status).to.eq(200);
                      const ids = (listResp.body.list ?? []).map(
                        (a) => a.app_id,
                      );
                      expect(
                        ids,
                        "another user's accessible list must not include the app",
                      ).to.not.include(app_id);
                    });

                    // 7. Back as the owner: delete succeeds
                    cy.logout();
                    cy.login_via_request(
                      ownerCredentials.email,
                      ownerCredentials.password,
                    ).then((loggedIn: boolean) => {
                      expect(loggedIn, "owner should be able to log back in")
                        .to.be.true;

                      cy.request({
                        method: "DELETE",
                        url: `/api/apps/${app_id}`,
                      }).then((deleteResp) => {
                        expect(
                          deleteResp.status,
                          "owning user should be able to delete their app",
                        ).to.eq(200);
                        expect(deleteResp.body).to.have.property(
                          "success",
                          true,
                        );
                      });

                      cy.request({
                        method: "DELETE",
                        url: `/api/apps/${implicit_app_id}`,
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

  it("a regular user cannot create platform-owned apps or apps owned by another account", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (created: boolean) => {
          expect(created, "user creation should succeed").to.be.true;

          cy.generate_random_code(10).then((randomCode: string) => {
            cy.request<CreateAppResponseBody>({
              method: "POST",
              url: "/api/apps",
              failOnStatusCode: false,
              body: appBody(generateV4Uuid(), `${randomCode}p`, {
                owner_type: "platform",
              }),
            }).then((resp) => {
              expect(
                resp.status,
                "non-admin must not create platform-owned apps",
              ).to.eq(403);
              expect(resp.body).to.have.property("success", false);
              expect(resp.body).to.not.have.property("resource_id");
            });

            cy.request<CreateAppResponseBody>({
              method: "POST",
              url: "/api/apps",
              failOnStatusCode: false,
              body: appBody(generateV4Uuid(), `${randomCode}o`, {
                owner_type: "user",
                owner_uid: generateV4Uuid(),
              }),
            }).then((resp) => {
              expect(
                resp.status,
                "a user must not create apps owned by another account",
              ).to.eq(403);
              expect(resp.body).to.have.property("success", false);
            });

            cy.request<CreateAppResponseBody>({
              method: "POST",
              url: "/api/apps",
              failOnStatusCode: false,
              body: appBody(generateV4Uuid(), `${randomCode}b`, {
                owner_type: "user",
                owner_organization_id: `some-org-${randomCode.toLowerCase()}`,
              }),
            }).then((resp) => {
              expect(
                resp.status,
                "a user-owned app cannot also name an owner organization",
              ).to.eq(400);
              expect(resp.body).to.have.property("success", false);
            });
          });
        },
      );
    });
  });

  it("an admin creating an app without ownership fields gets a platform-owned app", () => {
    cy.create_and_login_as_superuser_via_request().then((loggedIn: boolean) => {
      expect(loggedIn, "superuser login should succeed").to.be.true;

      cy.generate_random_code(10).then((randomCode: string) => {
        const app_id: string = generateV4Uuid();
        cy.request<CreateAppResponseBody>({
          method: "POST",
          url: "/api/apps",
          body: appBody(app_id, `${randomCode}a`, {}),
        }).then((createResp) => {
          expect(createResp.status).to.eq(200);
          expect(createResp.body.success).to.eq(true);
        });

        cy.request<GetAppResponseBody>({
          method: "GET",
          url: `/api/apps/${app_id}`,
        }).then((getResp) => {
          expect(getResp.status).to.eq(200);
          expect(getResp.body.app?.owner_type).to.eq("platform");
          expect(getResp.body.app?.owner_uid ?? null).to.eq(null);
          // Platform-owned definitions keep reporting the deployment's
          // virtual owner organization for backwards compatibility.
          expect(getResp.body.app?.owner_organization_id).to.be.a("string");
        });

        // The platform app is not in the admin's personal "owned" list
        cy.request<ListAppsResponseBody>({
          method: "GET",
          url: "/api/apps?list_apps_query_type=owned",
        }).then((listResp) => {
          expect(listResp.status).to.eq(200);
          const ids = (listResp.body.list ?? []).map((a) => a.app_id);
          expect(ids).to.not.include(app_id);
        });

        cy.request({
          method: "DELETE",
          url: `/api/apps/${app_id}`,
        }).then((deleteResp) => {
          expect(deleteResp.status).to.eq(200);
        });
      });
    });
  });
});
