// Covers the non-admin /orgs page
// (auth-server/src/app/(client)/(authenticated)/orgs/page.tsx): a signed-in
// user sees the organizations they belong to (MyOrganizationsCard), a stats
// row with their membership count (MyOrganizationsStatsRow), and their
// pending invitations (PendingInvitationsCard). Also covers the permanent
// redirect from the legacy /org/:organization_id route to
// /orgs/:organization_id (auth-server/next.config.ts).

interface CreateInvitationResponseBody {
  success: boolean;
  message?: string;
}

function expectStatValue(testid: string, expected: number): void {
  cy.get(`[data-testid="${testid}"]`, { timeout: 15000 })
    .scrollIntoView()
    .should("be.visible")
    .invoke("text")
    .then((text: string) => {
      expect(
        Number.parseInt(text.trim(), 10),
        `${testid} should read ${expected}`,
      ).to.equal(expected);
    });
}

describe("User organizations page (/orgs)", () => {
  describe("Unauthenticated access", () => {
    it("redirects unauthenticated users to the login page", () => {
      cy.visit("/orgs");
      cy.url().should("include", "/login");
      cy.url().should("not.match", /\/orgs(\/|\?|$)/);
    });

    it("redirects unauthenticated users off legacy /org/:id links", () => {
      cy.visit("/org/some-legacy-org");
      cy.url().should("include", "/login");
    });
  });

  describe("Regular user", () => {
    it("lists the user's organizations and counts them in the stats row", () => {
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request(credentials).then(
          (loggedIn: boolean) => {
            expect(loggedIn, "regular user login should succeed").to.be.true;

            // A fresh user belongs to no organizations yet.
            cy.visit("/orgs");
            cy.url().should("include", "/orgs");
            cy.wait_for_page_hydration();

            cy.get('[data-testid="my-organizations-stats-row"]').should(
              "be.visible",
            );
            cy.get('[data-testid="my-organizations-card"]').should(
              "be.visible",
            );
            cy.contains("Pending Invitations").should("exist");
            cy.contains("No pending invitations").should("exist");
            expectStatValue("my-organizations-stat-value", 0);
            expectStatValue("pending-invitations-stat-value", 0);

            cy.generate_random_code(12).then((randomCode: string) => {
              const organization_id = `orgs-page-${randomCode.toLowerCase()}`;
              const name = `Orgs Page Org ${randomCode}`;

              // The creating user becomes the organization's owner.
              cy.create_organization_via_request({ organization_id, name }).then(
                (created: boolean) => {
                  expect(created, "organization creation should succeed").to.be
                    .true;

                  cy.visit("/orgs");
                  cy.wait_for_page_hydration();

                  expectStatValue("my-organizations-stat-value", 1);
                  cy.get(`[data-testid="my-org-link-${organization_id}"]`)
                    .scrollIntoView()
                    .should("be.visible")
                    .should("contain", name)
                    .should("have.attr", "href", `/orgs/${organization_id}`);
                  cy.contains("tr", name).within(() => {
                    cy.contains("owner", { matchCase: false }).should("exist");
                  });

                  // Organization links from the table resolve to the org page.
                  cy.get(`[data-testid="my-org-link-${organization_id}"]`).click();
                  cy.url().should("include", `/orgs/${organization_id}`);
                  cy.contains(name).should("exist");

                  cy.delete_organization({ organization_id });
                },
              );
            });
          },
        );
      });
    });

    it("permanently redirects legacy /org/:id links to /orgs/:id", () => {
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request(credentials).then(
          (loggedIn: boolean) => {
            expect(loggedIn, "regular user login should succeed").to.be.true;

            cy.generate_random_code(12).then((randomCode: string) => {
              const organization_id = `legacy-org-${randomCode.toLowerCase()}`;
              const name = `Legacy Org ${randomCode}`;

              cy.create_organization_via_request({ organization_id, name }).then(
                () => {
                  cy.request({
                    method: "GET",
                    url: `/org/${organization_id}?tab=members`,
                    followRedirect: false,
                    failOnStatusCode: false,
                  }).then((response) => {
                    expect(
                      response.status,
                      "legacy /org/:id should permanently redirect",
                    ).to.equal(308);
                    expect(String(response.headers["location"])).to.include(
                      `/orgs/${organization_id}?tab=members`,
                    );
                  });

                  cy.visit(`/org/${organization_id}`);
                  cy.url().should("include", `/orgs/${organization_id}`);
                  cy.url().should("not.include", `/org/${organization_id}`);
                  cy.contains(name).should("exist");

                  cy.delete_organization({ organization_id });
                },
              );
            });
          },
        );
      });
    });

    it("shows pending invitations and updates the stats after accepting", () => {
      cy.generate_random_code(12).then((randomCode: string) => {
        const organization_id = `invite-orgs-${randomCode.toLowerCase()}`;
        const name = `Invite Orgs Page Org ${randomCode}`;

        cy.generate_random_test_user_credentials().then((invitee) => {
          // Register the invitee first so the invitation can target their
          // email, then switch to the superuser to create the org and invite.
          cy.create_and_login_as_regular_user_via_request(invitee).then(
            (inviteeRegistered: boolean) => {
              expect(inviteeRegistered, "invitee registration should succeed")
                .to.be.true;
              cy.logout();
              cy.create_and_login_as_superuser_via_request().then(
                (adminLoggedIn: boolean) => {
                  expect(adminLoggedIn, "superuser login should succeed").to.be
                    .true;
                cy.create_organization_via_request({ organization_id, name }).then(
                  () => {
                    cy.request<CreateInvitationResponseBody>({
                      method: "POST",
                      url: `/api/organizations/${organization_id}/invitations`,
                      body: { input_mode: "email", identifier: invitee.email },
                      failOnStatusCode: false,
                    }).then((response) => {
                      expect(
                        response.status,
                        "invitation creation should succeed",
                      ).to.be.oneOf([200, 201]);
                      expect(response.body).to.have.property("success", true);
                    });

                    cy.logout();
                    cy.login(invitee.email, invitee.password).then(
                      (inviteeLoggedIn: boolean) => {
                        expect(inviteeLoggedIn, "invitee login should succeed")
                          .to.be.true;

                        cy.visit("/orgs");
                        cy.wait_for_page_hydration();

                        expectStatValue("my-organizations-stat-value", 0);
                        expectStatValue("pending-invitations-stat-value", 1);

                        cy.intercept({
                          method: "PATCH",
                          url: `**/api/organizations/${organization_id}/invitations/*`,
                          times: 1,
                        }).as("acceptInvitationRequest");

                        cy.get(
                          `button[id^=accept-invitation-][id*=${organization_id}]`,
                        )
                          .should("have.length", 1)
                          .first()
                          .scrollIntoView()
                          .should("be.visible")
                          .click();

                        cy.wait("@acceptInvitationRequest", {
                          timeout: 20000,
                        }).then((interception) => {
                          expect(interception.response?.statusCode).to.equal(
                            200,
                          );
                        });

                        // Accepting refreshes both the memberships and the
                        // invitations on the page without a reload.
                        expectStatValue("pending-invitations-stat-value", 0);
                        expectStatValue("my-organizations-stat-value", 1);
                        cy.get(`[data-testid="my-org-link-${organization_id}"]`)
                          .scrollIntoView()
                          .should("be.visible")
                          .should("contain", name);
                        cy.contains("No pending invitations").should("exist");

                        // Cleanup as the organization owner.
                        cy.logout();
                        cy.create_and_login_as_superuser_via_request().then(() => {
                          cy.delete_organization({ organization_id });
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

  describe("Admin", () => {
    it("shows the admin's own membership count on /admin/organizations", () => {
      cy.create_and_login_as_superuser_via_request().then((loggedIn: boolean) => {
        expect(loggedIn, "superuser login should succeed").to.be.true;

        cy.visit("/admin/organizations");
        cy.url().should("include", "/admin/organizations");
        cy.wait_for_page_hydration();

        cy.get('[data-testid="my-organizations-stat-card"]').should("be.visible");
        // Admins always hold a virtual membership in the owner organization.
        cy.get('[data-testid="my-organizations-stat-value"]')
          .invoke("text")
          .then((text: string) => {
            expect(Number.parseInt(text.trim(), 10)).to.be.at.least(1);
          });

        // Admins see the same page as everyone else at /orgs.
        cy.visit("/orgs");
        cy.wait_for_page_hydration();
        cy.get('[data-testid="my-organizations-card"]').should("be.visible");
        cy.get('[data-testid="my-organizations-stat-value"]')
          .invoke("text")
          .then((text: string) => {
            expect(Number.parseInt(text.trim(), 10)).to.be.at.least(1);
          });
      });
    });
  });
});
