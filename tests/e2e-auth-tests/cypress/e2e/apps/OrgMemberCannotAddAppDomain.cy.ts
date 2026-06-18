// Verifies that POST /api/apps/:app_id/domains returns 403 when the
// authenticated caller is a regular MEMBER of the app's owner organization
// (i.e. role === "member") rather than an owner/admin. This guards the
// authorization branch in
// auth-server/src/app/api/apps/[app_id]/domains/POST_create_app_domain.ts
// that returns "You must be an admin or organization owner to add a domain
// to an application":
//
//   if (membership && (membership.role === "owner" || membership.role === "admin")) {
//     authorized = true;
//   }
//   ...
//   if (!authorized) { ... 403 ... }
//
// Existing coverage for this route:
//   - 401 (unauthenticated)        → misc/UnauthenticatedApiRequests.cy.ts
//                                     (the POST /api/apps/:appId/domains case)
// The "authenticated but org-member-only" case — i.e. the regression where
// somebody widens the role check to include `member` and accidentally lets
// any org member rewrite domain bindings — had no E2E coverage. The sibling
// DELETE-app and GET-app member-vs-non-member guards are exercised by
// apps/NonOrgMemberCannotDeleteApp.cy.ts and apps/NonOrgMemberCannotGetApp.cy.ts
// respectively, but those tests use a NON-member caller. This spec exercises
// the more specific "member-yes, but not owner/admin" branch on the domains
// POST handler.

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

interface RespondToInvitationResponseBody {
  success: boolean;
  message: string;
}

interface CreateAppResponseBody {
  success: boolean;
  message: string;
  resource_id?: string;
}

interface AddAppDomainResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped so they
// do not collide with same-named interfaces in other spec files.
export {};

describe("POST /api/apps/:app_id/domains for org-member (non-owner/admin) caller", () => {
  it("returns 403 when the caller's only org membership is role 'member'", () => {
    cy.generate_random_test_user_credentials().then((memberCredentials) => {
      // 1. Create the member's account first so that the invitation lookup
      //    (which expects an existing user) can resolve their email to a uid.
      cy.create_and_login_as_regular_user_via_request(memberCredentials).then(
        (memberCreated: boolean) => {
          expect(memberCreated, "member user creation should succeed").to.be
            .true;
          cy.logout();

          // 2. Log in as the superuser, who is a global admin and so can
          //    create the org, the app, and the invitation without needing
          //    org-level role assignments.
          cy.create_and_login_as_superuser_via_request().then(
            (adminLoggedIn: boolean) => {
              expect(adminLoggedIn, "superuser login should succeed").to.be
                .true;

              cy.generate_random_code(12).then((randomCode: string) => {
                const lowerCode = randomCode.toLowerCase();
                const organization_id = `app-dom-member-${lowerCode}`;
                const name = `App Domain Member Org ${randomCode}`;

                cy.create_organization_via_request({
                  organization_id,
                  name,
                }).then(() => {
                  // 3. Create a PRIVATE app owned by this org. The
                  //    private+owner_organization_id combination is what
                  //    arms the POST-domains authorization gate.
                  const app_id: string = crypto.randomUUID();
                  cy.request<CreateAppResponseBody>({
                    method: "POST",
                    url: "/api/apps",
                    body: {
                      app_id,
                      app_name: `App Dom Member ${randomCode}`,
                      app_description: `App for member-domain E2E test ${randomCode}`,
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
                    expect(createAppResp.body).to.have.property(
                      "success",
                      true,
                    );
                    expect(createAppResp.body.resource_id).to.eq(app_id);

                    // 4. Issue an invitation to the member account.
                    cy.request<CreateInvitationResponseBody>({
                      method: "POST",
                      url: `/api/organizations/${organization_id}/invitations`,
                      body: {
                        input_mode: "email",
                        identifier: memberCredentials.email,
                      },
                    }).then((createInviteResp) => {
                      expect(
                        createInviteResp.status,
                        "superuser should be able to invite the member to the org",
                      ).to.eq(201);
                      expect(createInviteResp.body.success).to.eq(true);
                      const invitation_id =
                        createInviteResp.body.data?.invitation.invitation_id;
                      if (!invitation_id) {
                        throw new Error(
                          "Expected the create-invitation response to include an invitation_id",
                        );
                      }

                      // 5. Switch to the invitee and accept the invitation.
                      //    `respondToInvitation` adds the new membership with
                      //    role 'member', which is the precondition under
                      //    test.
                      cy.logout();
                      cy.login_via_request(
                        memberCredentials.email,
                        memberCredentials.password,
                      ).then((memberLoggedIn: boolean) => {
                        expect(
                          memberLoggedIn,
                          "member should be able to log in",
                        ).to.be.true;

                        cy.request<RespondToInvitationResponseBody>({
                          method: "PATCH",
                          url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
                          body: { action: "accept" },
                        }).then((acceptResp) => {
                          expect(
                            acceptResp.status,
                            "member should be able to accept the invitation",
                          ).to.eq(200);
                          expect(acceptResp.body.success).to.eq(true);

                          // 6. As the org member, attempt to add a domain to
                          //    the org's private app. The handler must
                          //    reject this with 403 because role==='member'
                          //    is neither 'owner' nor 'admin'.
                          const new_domain = `member-${lowerCode}.example.test`;
                          cy.request<AddAppDomainResponseBody>({
                            method: "POST",
                            url: `/api/apps/${app_id}/domains`,
                            failOnStatusCode: false,
                            body: {
                              app_domain_ref_id: crypto.randomUUID(),
                              app_id,
                              domain: new_domain,
                              environment: "test",
                              created_at: Date.now(),
                              hardcoded: false,
                            },
                          }).then((postDomainResp) => {
                            expect(
                              postDomainResp.status,
                              "org-member (non-owner, non-admin) POST should return 403",
                            ).to.eq(403);
                            expect(postDomainResp.body).to.have.property(
                              "success",
                              false,
                            );
                            expect(
                              String(
                                postDomainResp.body.message ?? "",
                              ).toLowerCase(),
                              "message should explain owner/admin requirement",
                            ).to.include("owner");
                            expect(
                              postDomainResp.body,
                              "rejected response must not leak a created resource_id",
                            ).to.not.have.property("resource_id");
                          });
                        });
                      });
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
