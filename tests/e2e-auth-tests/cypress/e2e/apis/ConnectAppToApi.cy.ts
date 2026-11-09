import type { InviteAndAcceptOrgMembershipResult } from "@schemavaults/cypress-e2e-auth-tests-helper-commands/actions/invite_and_accept_org_membership";

function expectNumber(val: unknown): val is number {
  expect(
    typeof val === "number",
    `Value should be a number, received '${typeof val}'`,
  ).to.be.true;
  if (typeof val !== "number" || isNaN(val)) {
    return false;
  }
  return true;
}

interface ConnectResponseBody {
  success: boolean;
  message?: string;
  is_allowed?: boolean;
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
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

/** Signs in as a fresh regular user (no organizations, not an admin). */
function loginAsFreshRegularUser(): void {
  signOutIfAuthenticated();
  cy.generate_random_test_user_credentials()
    .then((credentials) => cy.create_and_login_as_regular_user_via_request(credentials))
    .then((ok: boolean) => {
      expect(ok, "regular user registration + login").to.be.true;
    });
}

/**
 * As the signed-in user (who must own `organization_id` or be an admin),
 * creates an app and an API server owned by the organization, by request.
 */
function createOrganizationOwnedAppAndApi(
  organization_id: string,
  app_id: string,
  api_server_id: string,
): void {
  const ownership = { owner_type: "organization", owner_organization_id: organization_id };
  cy.request({
    method: "POST",
    url: "/api/apps",
    body: {
      app_id,
      app_name: `Connect authz app ${app_id}`,
      app_description: "ConnectAppToApi.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      web: true,
      ...ownership,
    },
  }).then((response) => expect(response.status, `create app ${app_id}`).to.eq(200));
  cy.request({
    method: "POST",
    url: "/api/apis",
    body: {
      api_server_id,
      api_server_name: `Connect authz API ${api_server_id}`,
      api_server_description: "ConnectAppToApi.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      ...ownership,
    },
  }).then((response) => expect(response.status, `create API server ${api_server_id}`).to.eq(200));
}

function connect(
  api_server_id: string,
  app_id: string,
): Cypress.Chainable<Cypress.Response<ConnectResponseBody>> {
  return cy.request<ConnectResponseBody>({
    method: "POST",
    url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
    failOnStatusCode: false,
  });
}

describe("Connect App to API Server", () => {
  describe("Admin Success Cases", () => {
    it("admin can connect app to API from admin APIs page", () => {
      cy.create_and_login_as_superuser_via_request().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        // Create an organization for testing
        cy.generate_random_code(12).then((randomCode: string) => {
          const organization_id = `connect-test-org-${randomCode.toLowerCase()}`;
          const name = `Connect Test Organization ${randomCode}`;

          cy.create_organization({ organization_id, name }).then(() => {
            // Create an app in the organization
            const app_name = `Test App ${randomCode}`;
            const app_description = "Test app for connect API test";

            cy.create_app({
              app_name,
              app_description,
              organization_id,
            }).then((appResult) => {
              if (!appResult.success || !appResult.app_id) {
                throw new Error("Failed to create app");
              }

              // Create an API server in the organization
              const api_server_name = `Test API ${randomCode}`;
              const api_server_description = "Test API server for connect test";

              cy.create_api_server({
                api_server_name,
                api_server_description,
                organization_id,
              }).then((apiResult) => {
                if (!apiResult.success || !apiResult.api_server_id) {
                  throw new Error("Failed to create API server");
                }

                // Now connect the app to the API from the admin APIs page
                cy.connect_app_to_api({
                  client_app_id: appResult.app_id!,
                  api_server_id: apiResult.api_server_id!,
                  // Don't pass organization_id to use admin page
                }).then((result) => {
                  expect(result.success, "connect_app_to_api should succeed").to.be.true;
                  expect(result.status_code).to.equal(200);

                  // Cleanup
                  cy.delete_organization({ organization_id });
                });
              });
            });
          });
        });
      });
    });

    it("admin can connect app to API from organization page", () => {
      cy.create_and_login_as_superuser_via_request().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(12).then((randomCode: string) => {
          const organization_id = `connect-org-page-${randomCode.toLowerCase()}`;
          const name = `Connect Org Page Test ${randomCode}`;

          cy.create_organization({ organization_id, name }).then(() => {
            const app_name = `Org Page App ${randomCode}`;
            const app_description = "Test app from org page";

            cy.create_app({
              app_name,
              app_description,
              organization_id,
            }).then((appResult) => {
              if (!appResult.success || !appResult.app_id) {
                throw new Error("Failed to create app");
              }

              const api_server_name = `Org Page API ${randomCode}`;
              const api_server_description = "Test API from org page";

              cy.create_api_server({
                api_server_name,
                api_server_description,
                organization_id,
              }).then((apiResult) => {
                if (!apiResult.success || !apiResult.api_server_id) {
                  throw new Error("Failed to create API server");
                }

                // Connect from org page (pass organization_id)
                cy.connect_app_to_api({
                  client_app_id: appResult.app_id!,
                  api_server_id: apiResult.api_server_id!,
                  organization_id,
                }).then((result) => {
                  expect(result.success, "connect_app_to_api should succeed").to.be.true;
                  expect(result.status_code).to.equal(200);

                  // Cleanup
                  cy.delete_organization({ organization_id });
                });
              });
            });
          });
        });
      });
    });

    it("connecting apps from different organizations works for superuser", () => {
      cy.create_and_login_as_superuser_via_request().then((success: boolean) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(12).then((randomCode: string) => {
          // Create two separate organizations
          const org1_id = `diff-org-1-${randomCode.toLowerCase()}`;
          const org2_id = `diff-org-2-${randomCode.toLowerCase()}`;

          cy.create_organization({
            organization_id: org1_id,
            name: `Org 1 ${randomCode}`,
          }).then(() => {
            cy.create_organization({
              organization_id: org2_id,
              name: `Org 2 ${randomCode}`,
            }).then(() => {
              // Create app in org 1
              cy.create_app({
                app_name: `App in Org 1 ${randomCode}`,
                app_description: "App in first org",
                organization_id: org1_id,
              }).then((appResult) => {
                if (!appResult.success || !appResult.app_id) {
                  throw new Error("Failed to create app");
                }

                const client_app_id = appResult.app_id;

                // Create API in org 2
                cy.create_api_server({
                  api_server_name: `API in Org 2 ${randomCode}`,
                  api_server_description: "API in second org",
                  organization_id: org2_id,
                }).then((apiResult) => {
                  if (!apiResult.success || !apiResult.api_server_id) {
                    throw new Error("Failed to create API server");
                  }
                  const api_server_id = apiResult.api_server_id;

                  // Try to connect app from org1 to API from org2 (should fail)
                  cy.request({
                    method: "POST",
                    url: `/api/apis/${api_server_id}/connect_app/${client_app_id}`,
                    failOnStatusCode: false,
                  }).then((response) => {
                    expect(response.status).to.equal(200);

                    // Cleanup - delete both orgs
                    cy.delete_organization({ organization_id: org1_id });
                    cy.delete_organization({ organization_id: org2_id });
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  describe("Organization Owner Success Cases", () => {
    it("non-admin org owner can connect app to API within their organization", () => {
      // First create org and resources as admin
      cy.create_and_login_as_superuser_via_request().then((adminSuccess: boolean) => {
        if (!adminSuccess) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(12).then((randomCode: string) => {
          const organization_id = `owner-test-org-${randomCode.toLowerCase()}`;
          const name = `Owner Test Organization ${randomCode}`;

          cy.create_organization({ organization_id, name }).then(() => {
            // Create app and API server
            const app_name = `Owner App ${randomCode}`;
            const app_description = "Test app for owner test";
            const api_server_name = `Owner API ${randomCode}`;
            const api_server_description = "Test API for owner test";

            cy.create_app({
              app_name,
              app_description,
              organization_id,
            }).then((appResult) => {
              if (!appResult.success || !appResult.app_id) {
                throw new Error("Failed to create app");
              }

              const client_app_id = appResult.app_id;

              cy.create_api_server({
                api_server_name,
                api_server_description,
                organization_id,
              }).then((apiResult) => {
                if (!apiResult.success || !apiResult.api_server_id) {
                  throw new Error("Failed to create API server");
                }

                const api_server_id = apiResult.api_server_id;

                // Create a regular user to become owner
                cy.generate_random_test_user_credentials().then(
                  (ownerCredentials: { email: string; password: string }) => {
                    cy.create_and_login_as_regular_user_via_request(ownerCredentials).then(
                      (regularSuccess) => {
                        if (!regularSuccess) {
                          throw new Error("Failed to create regular user");
                        }

                        // Logout regular user
                        cy.logout();

                        // Login as admin again to invite the user
                        const superuser_credentials = {
                          // We'll use the admin invite flow differently
                          email: Cypress.env("PRIVATE_SUPERUSER_EMAIL"),
                          password: Cypress.env("PRIVATE_SUPERUSER_PASSWORD"),
                        };

                        if (
                          !superuser_credentials.email ||
                          !superuser_credentials.password
                        ) {
                          throw new TypeError(
                            "Failed to load superuser credentials!",
                          );
                        }

                        cy.wrap(ownerCredentials.email, {
                          log: false,
                        }).should("not.be", superuser_credentials.email);

                        cy.log(
                          "Superuser and regular user have been created. Logging back in to superuser account in order to invite regular user to new organization...",
                        );

                        // Invite the regular user to the organization
                        cy.invite_and_accept_org_membership({
                          organization_id,
                          inviter_credentials: superuser_credentials,
                          invitee_credentials: ownerCredentials,
                        }).then(
                          (
                            inviteResult: InviteAndAcceptOrgMembershipResult,
                          ) => {
                            if (
                              !inviteResult.invite_success ||
                              !inviteResult.accept_success
                            ) {
                              throw new Error(
                                "Failed to complete invite and accept flow",
                              );
                            }

                            cy.log(
                              "New user should now be in the newly created organization as a member...",
                            );

                            // Now login as admin and promote the member to owner
                            cy.logout();
                            cy.create_and_login_as_superuser_via_request().then(
                              (loginAsSuperuserSuccess: boolean) => {
                                if (!loginAsSuperuserSuccess) {
                                  throw new Error(
                                    "Failed to login as superuser in order to promote user to org owner!",
                                  );
                                }

                                cy.log(
                                  "Attempting to promote new member user to owner of organization...",
                                );

                                cy.promote_member_to_owner({
                                  organization_id,
                                  user_email: ownerCredentials.email,
                                }).then((promoteSuccess) => {
                                  if (!promoteSuccess) {
                                    throw new Error(
                                      "Failed to promote member to owner",
                                    );
                                  } else {
                                    cy.log(
                                      `Successfully promoted member user to owner of organization '${organization_id}'`,
                                    );
                                  }

                                  // Now logout and login as the owner
                                  cy.logout();
                                  cy.login_via_request(
                                    ownerCredentials.email,
                                    ownerCredentials.password,
                                  ).then((ownerLoginSuccess) => {
                                    if (!ownerLoginSuccess) {
                                      throw new Error(
                                        "Failed to login as new organization owner",
                                      );
                                    }

                                    cy.log(
                                      `Successfully logged in as regular user '${ownerCredentials.email}', the owner of new organization '${organization_id}'!`,
                                    );

                                    // Verify they're NOT an admin
                                    cy.is_admin().then(
                                      (is_regular_user_an_admin: boolean) => {
                                        if (is_regular_user_an_admin) {
                                          throw new Error(
                                            "Expected newly created user to not be an admin!",
                                          );
                                        }
                                      },
                                    );

                                    cy.log(
                                      "Attempting to connect app to API...",
                                    );

                                    // Now connect app to API as org owner
                                    cy.connect_app_to_api({
                                      client_app_id,
                                      api_server_id,
                                      organization_id,
                                    }).then((result) => {
                                      expect(result.success, "connect_app_to_api should succeed").to.be.true;
                                      const status_code: number =
                                        result.status_code;
                                      expect(
                                        [200, 201],
                                        "App-to-Api connection should have 200 or 201 response status",
                                      ).to.include(status_code);

                                      cy.log(
                                        "App-to-api connection for regular user was a success! Cleaning up now...",
                                      );

                                      // Cleanup - login as admin to delete org
                                      cy.logout();
                                      cy.create_and_login_as_superuser_via_request().then(
                                        () => {
                                          cy.delete_organization({
                                            organization_id,
                                          });
                                        },
                                      );
                                    });
                                  });
                                });
                              },
                            );
                          },
                        );
                      },
                    );
                  },
                );
              });
            });
          });
        });
      });
    });
  });

  describe("Authorization Failure Cases", () => {
    it("non-owner member cannot connect apps (403)", () => {
      cy.create_and_login_as_superuser_via_request().then((adminSuccess) => {
        if (!adminSuccess) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(12).then((randomCode: string) => {
          const organization_id = `member-fail-org-${randomCode.toLowerCase()}`;
          const name = `Member Fail Test ${randomCode}`;

          cy.create_organization({ organization_id, name }).then(() => {
            const app_name = `Member Fail App ${randomCode}`;
            const app_description = "Test app for member fail test";
            const api_server_name = `Member Fail API ${randomCode}`;
            const api_server_description = "Test API for member fail test";

            cy.create_app({
              app_name,
              app_description,
              organization_id,
            }).then((appResult) => {
              if (!appResult.success || !appResult.app_id) {
                throw new Error("Failed to create app");
              }

              const client_app_id = appResult.app_id;

              cy.create_api_server({
                api_server_name,
                api_server_description,
                organization_id,
              }).then((apiResult) => {
                if (!apiResult.success || !apiResult.api_server_id) {
                  throw new Error("Failed to create API server");
                }

                const api_server_id = apiResult.api_server_id;

                // Create a regular user (will be member, not owner)
                cy.generate_random_test_user_credentials().then(
                  (memberCredentials) => {
                    cy.logout();

                    cy.create_and_login_as_regular_user_via_request(memberCredentials).then(
                      (regularSuccess) => {
                        if (!regularSuccess) {
                          throw new Error("Failed to create regular user");
                        }

                        cy.logout();
                        cy.create_and_login_as_superuser_via_request().then(() => {
                          // Invite the user to the organization (as member, not owner)
                          cy.visit(`/orgs/${organization_id}`);
                          cy.wait_for_page_hydration();

                          cy.open_dialog_with_button(
                            "open-invite-member-dialog-button",
                            "invite-member-dialog-content",
                          ).then(() => {
                            cy.get(
                              '[data-testid="invite-member-identifier-input"]',
                            )
                              .clear()
                              .type(memberCredentials.email);

                            cy.intercept({
                              method: "POST",
                              url: `**/api/organizations/${organization_id}/invitations`,
                              times: 1,
                            }).as("inviteRequest");

                            cy.get(
                              '[data-testid="submit-invite-member-form-button"]',
                            ).click();

                            cy.wait("@inviteRequest").then((interception) => {
                              const statusCode =
                                interception.response?.statusCode;
                              if (!expectNumber(statusCode)) {
                                throw new TypeError(
                                  "Expected statusCode to be a number!",
                                );
                              }

                              if (![200, 201].includes(statusCode)) {
                                throw new TypeError("Bad status code!");
                              }

                              cy.logout();

                              // Login as member and accept invitation
                              cy.login_via_request(
                                memberCredentials.email,
                                memberCredentials.password,
                              ).then(() => {
                                cy.visit("/account");
                                cy.wait_for_page_hydration();

                                cy.intercept({
                                  method: "PATCH",
                                  url: `**/api/organizations/${organization_id}/invitations/*`,
                                  times: 1,
                                }).as("acceptRequest");

                                cy.contains("button", "Accept").first().click();

                                cy.wait("@acceptRequest").then(
                                  (acceptInterception) => {
                                    expect(
                                      acceptInterception.response?.statusCode,
                                    ).to.equal(200);

                                    // Now try to connect app to API as member (should fail with 403)
                                    cy.intercept({
                                      method: "POST",
                                      url: `**/api/apis/${api_server_id}/connect_app/${client_app_id}`,
                                      times: 1,
                                    }).as("connectRequest");

                                    // Make direct API call since UI might not be accessible
                                    cy.request({
                                      method: "POST",
                                      url: `/api/apis/${api_server_id}/connect_app/${client_app_id}`,
                                      failOnStatusCode: false,
                                    }).then((response) => {
                                      expect(response.status).to.equal(403);
                                      expect(response.body.message).to.include(
                                        "owner",
                                      );

                                      // Cleanup - login as admin to delete org
                                      cy.logout();
                                      cy.create_and_login_as_superuser_via_request().then(
                                        () => {
                                          cy.delete_organization({
                                            organization_id,
                                          });
                                        },
                                      );
                                    });
                                  },
                                );
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
        });
      });
    });
  });

  describe("Authorization Failure Cases (outsiders and one-sided owners)", () => {
    beforeEach(() => {
      cy.reset_rate_limit();
    });

    it("a user outside the owning organization cannot connect its app to its API (403)", () => {
      const organization_id = randomId("e2e-outsider-org");
      const app_id = randomId("e2e-connect-outsider-app");
      const api_server_id = randomId("e2e-connect-outsider-api");

      loginAsSuperuser();
      cy.create_organization_via_request({
        organization_id,
        name: `Connect outsider ${organization_id}`,
      });
      createOrganizationOwnedAppAndApi(organization_id, app_id, api_server_id);

      // Signed in, but no membership of the organization at all.
      loginAsFreshRegularUser();
      connect(api_server_id, app_id).then((response) => {
        expect(response.status, "connect by an outsider").to.eq(403);
        expect(response.body.success).to.eq(false);
      });
      cy.request({
        method: "GET",
        url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "connection check by an outsider").to.eq(403);
      });

      // Nothing was connected.
      loginAsSuperuser();
      cy.request<ConnectResponseBody>({
        method: "GET",
        url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
      }).then((response) => {
        expect(response.body.is_allowed, "still not connected").to.eq(false);
      });
      cy.delete_organization({ organization_id });
      signOutIfAuthenticated();
    });

    it("owning only the app, or only the API server, is not enough (403)", () => {
      const suffix = Math.random().toString(36).slice(2, 10);
      const own_org = `e2e-connect-own-org-${suffix}`;
      const own_app = `e2e-connect-own-app-${suffix}`;
      const own_api = `e2e-connect-own-api-${suffix}`;
      const other_org = `e2e-connect-other-org-${suffix}`;
      const other_app = `e2e-connect-other-app-${suffix}`;
      const other_api = `e2e-connect-other-api-${suffix}`;

      // Another user's organization, app and API server.
      loginAsFreshRegularUser();
      cy.create_organization_via_request({ organization_id: other_org, name: `Other ${suffix}` });
      createOrganizationOwnedAppAndApi(other_org, other_app, other_api);

      // This user owns their own organization, app and API server.
      loginAsFreshRegularUser();
      cy.create_organization_via_request({ organization_id: own_org, name: `Own ${suffix}` });
      createOrganizationOwnedAppAndApi(own_org, own_app, own_api);

      connect(other_api, own_app).then((response) => {
        expect(response.status, "own app to someone else's API server").to.eq(403);
        expect(response.body.message, "names both sides").to.include("both");
      });
      connect(own_api, other_app).then((response) => {
        expect(response.status, "someone else's app to own API server").to.eq(403);
        expect(response.body.message, "names the app").to.include("own the app");
      });
      // Control: their own app and API server connect fine.
      connect(own_api, own_app).then((response) => {
        expect(response.status, "own app to own API server").to.eq(200);
      });
      cy.request<ConnectResponseBody>({
        method: "GET",
        url: `/api/apis/${own_api}/connect_app/${own_app}`,
      }).then((response) => {
        expect(response.body.is_allowed, "own pair connected").to.eq(true);
      });
      signOutIfAuthenticated();
    });
  });

  describe("Validation Failure Cases", () => {
    it("connecting with non-existent app ID returns 404", () => {
      cy.create_and_login_as_superuser_via_request().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(12).then((randomCode: string) => {
          const organization_id = `not-found-test-${randomCode.toLowerCase()}`;
          const name = `Not Found Test ${randomCode}`;

          cy.create_organization({ organization_id, name }).then(() => {
            cy.create_api_server({
              api_server_name: `Valid API ${randomCode}`,
              api_server_description: "Valid API server",
              organization_id,
            }).then((apiResult) => {
              if (!apiResult.success || !apiResult.api_server_id) {
                throw new Error("Failed to create API server");
              }

              // Use a fake app ID
              const fake_app_id = "00000000-0000-0000-0000-000000000000";
              const client_app_id = fake_app_id;

              const api_server_id = apiResult.api_server_id;

              cy.request({
                method: "POST",
                url: `/api/apis/${api_server_id}/connect_app/${client_app_id}`,
                failOnStatusCode: false,
              }).then((response) => {
                expect(response.status).to.equal(404);
                expect(response.body.message).to.include("not found");

                // Cleanup
                cy.delete_organization({ organization_id });
              });
            });
          });
        });
      });
    });

    it("connecting with non-existent API server ID returns 404", () => {
      cy.create_and_login_as_superuser_via_request().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(12).then((randomCode: string) => {
          const organization_id = `api-not-found-${randomCode.toLowerCase()}`;
          const name = `API Not Found Test ${randomCode}`;

          cy.create_organization({ organization_id, name }).then(() => {
            cy.create_app({
              app_name: `Valid App ${randomCode}`,
              app_description: "Valid app",
              organization_id,
            }).then((appResult) => {
              if (!appResult.success || !appResult.app_id) {
                throw new Error("Failed to create app");
              }

              const client_app_id = appResult.app_id;

              // Use a fake API server ID
              const fake_api_id = "00000000-0000-0000-0000-000000000000";
              const api_server_id = fake_api_id;

              cy.request({
                method: "POST",
                url: `/api/apis/${api_server_id}/connect_app/${client_app_id}`,
                failOnStatusCode: false,
              }).then((response) => {
                if (response.status > 299) {
                  cy.log(response.body);
                }
                expect(response.status).to.equal(404);
                expect(response.body.message).to.include("not found");

                // Cleanup
                cy.delete_organization({ organization_id });
              });
            });
          });
        });
      });
    });
  });
});
