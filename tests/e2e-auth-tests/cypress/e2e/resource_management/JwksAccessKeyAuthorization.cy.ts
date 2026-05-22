// Verifies authorization on the JWKS access-key management endpoints under
// auth-server/src/app/api/apis/[api_server_id]/jwks-access-key/.
//
// POST   — generate the initial key pair
// PUT    — regenerate (rotate) the key pair
// GET    — read key metadata
//
// Expected behavior:
// - Organization OWNERS of the API server's owner org can POST/PUT/GET.
// - Global admins (user.admin === true) can POST/PUT/GET regardless of org
//   membership.
// - Regular MEMBERS of the owner org are rejected with 403 on all three
//   endpoints. Before the fix, members could silently generate/rotate keys.

interface CreateInvitationResponseBody {
  success: boolean;
  message: string;
  data?: {
    invitation: {
      invitation_id: string;
      organization_id: string;
      invitee_uid: string;
    };
  };
}

interface OrgApiContext {
  organization_id: string;
  api_server_id: string;
  invitee_credentials: { email: string; password: string };
  invitee_uid: string;
}

// Create an organization owned by the superuser-panel, and an API server
// owned by that org. Create a second regular user, invite+accept them as a
// 'member' of the org. Returns ids + credentials while leaving the test
// logged OUT (the caller decides which user to log in as).
function setup_org_with_api_and_member(): Cypress.Chainable<OrgApiContext> {
  return cy
    .create_and_login_as_superuser()
    .then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }
      return cy.generate_random_code(12);
    })
    .then((orgCode: string) => {
      const organization_id = `jwks-authz-${orgCode.toLowerCase()}`;
      const name = `JWKS Authz Test Org ${orgCode}`;

      return cy
        .create_organization({ organization_id, name })
        .then(() => cy.generate_random_code(8))
        .then((apiCode: string) => {
          const api_server_name = `JWKS Authz API ${apiCode}`;
          const api_server_description = `E2E JWKS authz ${apiCode}`;

          return cy
            .create_api_server({
              api_server_name,
              api_server_description,
              organization_id,
            })
            .then(({ success: apiSuccess, api_server_id }) => {
              if (!apiSuccess || !api_server_id) {
                throw new Error(
                  "Failed to create API server owned by the test organization",
                );
              }

              return cy
                .generate_random_test_user_credentials()
                .then((invitee_credentials) => {
                  // Create the invitee account (logs them in), then log out.
                  return cy
                    .create_and_login_as_regular_user(invitee_credentials)
                    .then((createdInvitee: boolean) => {
                      if (!createdInvitee) {
                        throw new Error("Failed to create invitee user");
                      }
                      cy.logout();

                      // Back in as superuser, send + auto-accept invite.
                      return cy
                        .create_and_login_as_superuser()
                        .then(() =>
                          cy.request<CreateInvitationResponseBody>({
                            method: "POST",
                            url: `/api/organizations/${organization_id}/invitations`,
                            body: {
                              input_mode: "email",
                              identifier: invitee_credentials.email,
                            },
                          }),
                        )
                        .then((invitationResponse) => {
                          expect(invitationResponse.status).to.eq(201);
                          expect(invitationResponse.body.success).to.eq(true);
                          const invitation = invitationResponse.body.data?.invitation;
                          if (!invitation) {
                            throw new Error(
                              "Expected invitation data on create-invitation response",
                            );
                          }
                          const invitation_id = invitation.invitation_id;
                          const invitee_uid = invitation.invitee_uid;

                          // Switch to invitee, accept invitation, then log out.
                          cy.logout();
                          return cy
                            .login(
                              invitee_credentials.email,
                              invitee_credentials.password,
                            )
                            .then((inviteeLoggedIn: boolean) => {
                              if (!inviteeLoggedIn) {
                                throw new Error(
                                  "Failed to login as invitee for invitation accept",
                                );
                              }
                              return cy.request({
                                method: "PATCH",
                                url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
                                body: { action: "accept" },
                              });
                            })
                            .then((acceptResponse) => {
                              expect(acceptResponse.status).to.eq(200);
                              cy.logout();
                              return cy.wrap<OrgApiContext>(
                                {
                                  organization_id,
                                  api_server_id,
                                  invitee_credentials,
                                  invitee_uid,
                                },
                                { log: false },
                              );
                            });
                        });
                    });
                });
            });
        });
    });
}

// Module marker: keeps this spec's top-level interfaces file-scoped so they
// do not collide with same-named interfaces in other spec files.
export {};

describe("JWKS Access Key Authorization", () => {
  it("owner of the API's owner organization can POST, GET, and PUT jwks-access-key", () => {
    setup_org_with_api_and_member().then((ctx) => {
      // Promote the member to owner via the members-role API, as superuser.
      cy.create_and_login_as_superuser_via_request()
        .then(() =>
          cy.request({
            method: "PATCH",
            url: `/api/organizations/${ctx.organization_id}/members/${ctx.invitee_uid}/role`,
            body: { role: "owner" },
          }),
        )
        .then((promoteResponse) => {
          expect(promoteResponse.status).to.eq(200);
          cy.logout();
        })
        .then(() =>
          cy.login_via_request(ctx.invitee_credentials.email, ctx.invitee_credentials.password),
        )
        .then((ownerLoggedIn: boolean) => {
          if (!ownerLoggedIn) {
            throw new Error("Failed to login as promoted owner");
          }

          // POST: generate key
          cy.request({
            method: "POST",
            url: `/api/apis/${ctx.api_server_id}/jwks-access-key`,
            failOnStatusCode: false,
          }).then((postResponse) => {
            expect(postResponse.status).to.eq(200);
            expect(postResponse.body).to.have.property("success", true);
            expect(postResponse.body.key_id).to.be.a("string").and.not.empty;
            expect(postResponse.body.private_key).to.be.a("string").and.not.empty;
            const firstKeyId: string = postResponse.body.key_id;

            // GET: metadata
            cy.request({
              method: "GET",
              url: `/api/apis/${ctx.api_server_id}/jwks-access-key`,
              failOnStatusCode: false,
            }).then((getResponse) => {
              expect(getResponse.status).to.eq(200);
              expect(getResponse.body).to.have.property("success", true);
              expect(getResponse.body.key_metadata).to.be.an("object");
            });

            // PUT: regenerate — must yield a different key_id.
            cy.request({
              method: "PUT",
              url: `/api/apis/${ctx.api_server_id}/jwks-access-key`,
              failOnStatusCode: false,
            }).then((putResponse) => {
              expect(putResponse.status).to.eq(200);
              expect(putResponse.body).to.have.property("success", true);
              expect(putResponse.body.key_id).to.be.a("string").and.not.empty;
              expect(putResponse.body.key_id).to.not.eq(firstKeyId);
            });
          });
        });
    });
  });

  it("non-owner member of the API's owner organization receives 403 on POST, GET, and PUT", () => {
    setup_org_with_api_and_member().then((ctx) => {
      // Log in as the member (NOT promoted to owner).
      cy.login_via_request(ctx.invitee_credentials.email, ctx.invitee_credentials.password).then(
        (memberLoggedIn: boolean) => {
          if (!memberLoggedIn) {
            throw new Error("Failed to login as invitee member");
          }

          cy.request({
            method: "POST",
            url: `/api/apis/${ctx.api_server_id}/jwks-access-key`,
            failOnStatusCode: false,
          }).then((postResponse) => {
            expect(postResponse.status).to.eq(403);
            expect(postResponse.body).to.have.property("success", false);
          });

          cy.request({
            method: "GET",
            url: `/api/apis/${ctx.api_server_id}/jwks-access-key`,
            failOnStatusCode: false,
          }).then((getResponse) => {
            expect(getResponse.status).to.eq(403);
            expect(getResponse.body).to.have.property("success", false);
          });

          cy.request({
            method: "PUT",
            url: `/api/apis/${ctx.api_server_id}/jwks-access-key`,
            failOnStatusCode: false,
          }).then((putResponse) => {
            expect(putResponse.status).to.eq(403);
            expect(putResponse.body).to.have.property("success", false);
          });
        },
      );
    });
  });

  it("global admin (not a member of the owner org) can POST, GET, and PUT via user.admin bypass", () => {
    // Reuse the same setup so the API server exists and its owner org has
    // exactly one (non-admin) member. The superuser is not a member of this org.
    setup_org_with_api_and_member().then((ctx) => {
      cy.create_and_login_as_superuser_via_request().then((adminLoggedIn: boolean) => {
        if (!adminLoggedIn) {
          throw new Error("Failed to login as superuser for admin bypass test");
        }

        cy.request({
          method: "POST",
          url: `/api/apis/${ctx.api_server_id}/jwks-access-key`,
          failOnStatusCode: false,
        }).then((postResponse) => {
          expect(postResponse.status).to.eq(200);
          expect(postResponse.body).to.have.property("success", true);
          expect(postResponse.body.key_id).to.be.a("string").and.not.empty;
          const firstKeyId: string = postResponse.body.key_id;

          cy.request({
            method: "GET",
            url: `/api/apis/${ctx.api_server_id}/jwks-access-key`,
            failOnStatusCode: false,
          }).then((getResponse) => {
            expect(getResponse.status).to.eq(200);
            expect(getResponse.body).to.have.property("success", true);
            expect(getResponse.body.key_metadata).to.be.an("object");
          });

          cy.request({
            method: "PUT",
            url: `/api/apis/${ctx.api_server_id}/jwks-access-key`,
            failOnStatusCode: false,
          }).then((putResponse) => {
            expect(putResponse.status).to.eq(200);
            expect(putResponse.body).to.have.property("success", true);
            expect(putResponse.body.key_id).to.be.a("string").and.not.empty;
            expect(putResponse.body.key_id).to.not.eq(firstKeyId);
          });
        });
      });
    });
  });
});
