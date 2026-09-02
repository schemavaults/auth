// Covers the administrator-only "add existing user" surface:
//
//   POST /api/organizations/:organization_id/members  { uid, role }
//
// and the matching `AddExistingMemberCard` rendered on `/org/:organization_id`
// (auth-server/src/app/(client)/(authenticated)/org/[organization_id]/org_page_view.tsx).
//
// Unlike the invitation flow, a direct add creates the membership row
// immediately with the chosen role and requires no acceptance by the user,
// so the endpoint is restricted to global admins — organization owners who
// are not admins must keep using invitations and receive 403 here.

interface UsersListResponseBody {
  success: boolean;
  data?: {
    users: Array<{ uid: string; email: string }>;
  };
}

interface AddMemberResponseBody {
  success: boolean;
  message: string;
  data?: {
    member: { uid: string; role: string; email: string };
  };
}

interface OrganizationMembersResponseBody {
  success: boolean;
  data?: {
    members: Array<{ uid: string; email: string; role: string }>;
  };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function lookupUidByEmail(email: string): Cypress.Chainable<string> {
  return cy
    .request<UsersListResponseBody>({
      method: "GET",
      url: "/api/admin/users/list",
    })
    .then((response) => {
      expect(response.status).to.equal(200);
      const match = response.body.data?.users.find((u) => u.email === email);
      if (!match) {
        throw new Error(`Expected '${email}' to appear in the users list`);
      }
      return match.uid;
    });
}

describe("Admin adds an existing user to an organization", () => {
  it("POST /api/organizations/:organization_id/members adds the user directly, rejects duplicates, and rejects non-admin owners", () => {
    cy.generate_random_code(12).then((randomCode: string) => {
      const organization_id = `add-existing-${randomCode.toLowerCase()}`;
      const name = `Add Existing Member Test Org ${randomCode}`;

      cy.generate_random_test_user_credentials().then((ownerCredentials) => {
        cy.generate_random_test_user_credentials().then(
          (otherCredentials) => {
            // 1. Register the two regular users up-front.
            cy.create_and_login_as_regular_user_via_request(
              ownerCredentials,
            ).then((created: boolean) => {
              if (!created) throw new Error("Failed to create owner user");
            });
            cy.logout();
            cy.create_and_login_as_regular_user_via_request(
              otherCredentials,
            ).then((created: boolean) => {
              if (!created) throw new Error("Failed to create other user");
            });
            cy.logout();

            // 2. As the superuser, create the org and add the first user as
            //    an owner without any invitation round-trip.
            cy.create_and_login_as_superuser_via_request().then(
              (suSuccess: boolean) => {
                if (!suSuccess) throw new Error("Failed to login as superuser");

                cy.create_organization_via_request({ organization_id, name });

                lookupUidByEmail(ownerCredentials.email).then((owner_uid) => {
                  cy.request<AddMemberResponseBody>({
                    method: "POST",
                    url: `/api/organizations/${organization_id}/members`,
                    body: { uid: owner_uid, role: "owner" },
                    failOnStatusCode: false,
                  }).then((addResponse) => {
                    expect(
                      addResponse.status,
                      "admin direct add should succeed",
                    ).to.equal(201);
                    expect(addResponse.body.success).to.equal(true);
                    expect(addResponse.body.data?.member.uid).to.equal(
                      owner_uid,
                    );
                    expect(addResponse.body.data?.member.role).to.equal(
                      "owner",
                    );
                  });

                  // The membership row exists immediately with the chosen role.
                  cy.request<OrganizationMembersResponseBody>({
                    method: "GET",
                    url: `/api/organizations/${organization_id}/members`,
                  }).then((membersResponse) => {
                    expect(membersResponse.status).to.equal(200);
                    const added = membersResponse.body.data?.members.find(
                      (m) => m.uid === owner_uid,
                    );
                    if (!added) {
                      throw new Error(
                        "Expected the directly-added user to appear in the members list",
                      );
                    }
                    expect(added.role).to.equal("owner");
                    expect(added.email).to.equal(ownerCredentials.email);
                  });

                  // Adding the same user again is a conflict.
                  cy.request<AddMemberResponseBody>({
                    method: "POST",
                    url: `/api/organizations/${organization_id}/members`,
                    body: { uid: owner_uid, role: "member" },
                    failOnStatusCode: false,
                  }).then((duplicateResponse) => {
                    expect(duplicateResponse.status).to.equal(409);
                    expect(duplicateResponse.body.success).to.equal(false);
                    expect(
                      String(duplicateResponse.body.message).toLowerCase(),
                    ).to.include("already a member");
                  });

                  // The virtual admin role is never assignable.
                  cy.request({
                    method: "POST",
                    url: `/api/organizations/${organization_id}/members`,
                    body: { uid: owner_uid, role: "admin" },
                    failOnStatusCode: false,
                  }).then((badRoleResponse) => {
                    expect(badRoleResponse.status).to.equal(400);
                  });

                  // Unknown users are 404.
                  cy.request({
                    method: "POST",
                    url: `/api/organizations/${organization_id}/members`,
                    body: {
                      uid: "00000000-0000-4000-8000-000000000000",
                      role: "member",
                    },
                    failOnStatusCode: false,
                  }).then((missingUserResponse) => {
                    expect(missingUserResponse.status).to.equal(404);
                  });

                  // System organizations cannot receive declared memberships.
                  cy.request({
                    method: "POST",
                    url: `/api/organizations/schemavaults/members`,
                    body: { uid: owner_uid, role: "member" },
                    failOnStatusCode: false,
                  }).then((systemOrgResponse) => {
                    expect(systemOrgResponse.status).to.equal(403);
                  });
                });

                lookupUidByEmail(otherCredentials.email).then((other_uid) => {
                  // 3. Even as an organization OWNER, a non-admin user must not
                  //    be able to bypass the invitation flow.
                  cy.logout();
                  cy.login_via_request(
                    ownerCredentials.email,
                    ownerCredentials.password,
                  ).then((loggedIn: boolean) => {
                    if (!loggedIn) throw new Error("Failed to login as owner");

                    cy.request<AddMemberResponseBody>({
                      method: "POST",
                      url: `/api/organizations/${organization_id}/members`,
                      body: { uid: other_uid, role: "member" },
                      failOnStatusCode: false,
                    }).then((ownerAddResponse) => {
                      expect(
                        ownerAddResponse.status,
                        "non-admin owner must not add users directly",
                      ).to.equal(403);
                      expect(ownerAddResponse.body.success).to.equal(false);
                    });

                    cy.request<OrganizationMembersResponseBody>({
                      method: "GET",
                      url: `/api/organizations/${organization_id}/members`,
                    }).then((membersResponse) => {
                      const leaked = membersResponse.body.data?.members.find(
                        (m) => m.uid === other_uid,
                      );
                      expect(leaked, "no membership should be created").to.equal(
                        undefined,
                      );
                    });
                  });

                  // 4. Cleanup as superuser.
                  cy.logout();
                  cy.create_and_login_as_superuser_via_request().then(() => {
                    cy.delete_organization({ organization_id });
                  });
                });
              },
            );
          },
        );
      });
    });
  });

  it("the add-existing-user card is rendered for admins only and adds the selected user", () => {
    cy.generate_random_code(12).then((randomCode: string) => {
      const organization_id = `add-existing-ui-${randomCode.toLowerCase()}`;
      const name = `Add Existing Member UI Test Org ${randomCode}`;

      cy.generate_random_test_user_credentials().then((memberCredentials) => {
        cy.create_and_login_as_regular_user_via_request(memberCredentials).then(
          (created: boolean) => {
            if (!created) throw new Error("Failed to create member user");
          },
        );
        cy.logout();

        cy.create_and_login_as_superuser_via_request().then(
          (suSuccess: boolean) => {
            if (!suSuccess) throw new Error("Failed to login as superuser");

            cy.create_organization_via_request({ organization_id, name });

            cy.visit(`/org/${organization_id}`);
            cy.wait_for_page_hydration();
            cy.contains(name).should("exist");

            cy.get('[data-testid="add-existing-member-card"]').should(
              "be.visible",
            );

            // Pick the user from the global users list via the combobox.
            cy.get('[data-testid="add-existing-member-user-combobox"]')
              .should("not.be.disabled")
              .click();
            cy.get("[cmdk-input]").should("be.visible").type(
              memberCredentials.email,
            );
            cy.contains("[cmdk-item]", memberCredentials.email)
              .should("be.visible")
              .click();
            cy.get('[data-testid="add-existing-member-user-combobox"]').should(
              "contain.text",
              memberCredentials.email,
            );

            cy.get(
              '[data-testid="submit-add-existing-member-form-button"]',
            ).click();

            // The members table revalidates and now lists the user.
            cy.contains("User added!").should("exist");
            cy.get('[data-testid="add-existing-member-card"]').should(
              "not.contain.text",
              memberCredentials.email,
            );
            cy.request<OrganizationMembersResponseBody>({
              method: "GET",
              url: `/api/organizations/${organization_id}/members`,
            }).then((membersResponse) => {
              const added = membersResponse.body.data?.members.find(
                (m) => m.email === memberCredentials.email,
              );
              if (!added) {
                throw new Error(
                  "Expected the user added through the card to appear in the members list",
                );
              }
              expect(added.role).to.equal("member");
            });

            // A non-admin member of the org must not see the card at all.
            cy.logout();
            cy.login_via_request(
              memberCredentials.email,
              memberCredentials.password,
            ).then((loggedIn: boolean) => {
              if (!loggedIn) throw new Error("Failed to login as member");

              cy.visit(`/org/${organization_id}`);
              cy.wait_for_page_hydration();
              cy.contains(name).should("exist");
              cy.get('[data-testid="add-existing-member-card"]').should(
                "not.exist",
              );
            });

            cy.logout();
            cy.create_and_login_as_superuser_via_request().then(() => {
              cy.delete_organization({ organization_id });
            });
          },
        );
      });
    });
  });
});
