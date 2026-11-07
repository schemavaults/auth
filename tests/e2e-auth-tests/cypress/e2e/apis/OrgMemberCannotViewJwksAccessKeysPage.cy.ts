// Verifies that the JWKS access keys PAGE at
// /apis/[api_server_id]/jwks-access-keys redirects an authenticated caller
// whose only membership of the API server's owner organization is role
// 'member' to /error?error=403&error_id=forbidden.
//
// The page performs its own authorization check, separate from the API
// routes it drives:
//
//   auth-server/src/app/(client)/(authenticated)/apis/[api_server_id]/jwks-access-keys/page.tsx
//     const canView: boolean = await canUserManageResource(dbh.db, user, api_server);
//     if (!canView) { redirectWithError(403, 'forbidden'); }
//
// `canUserManageResource` (not `canUserViewResource`) is the gate: a plain
// 'member' of the owning organization may VIEW the API server but may not
// manage its JWKS access key — the credential its resource server uses to
// authenticate itself to the auth server. Swapping the page's call for the
// view-level check, or dropping it, would hand every org member the key
// metadata and the "generate / rotate key" controls.
//
// Existing coverage for this surface:
//   - the unauthenticated redirect off this page
//       → misc/UnauthenticatedRedirects.cy.ts
//   - the API routes under /api/apis/:api_server_id/jwks-access-key,
//     including the member-role 403 on POST/GET/PUT
//       → resource_management/JwksAccessKeyAuthorization.cy.ts
// The page-level guard itself had no E2E coverage: a signed-in org member
// could have been served the page (and its controls) without any spec
// failing.

interface CreateApiServerResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
}

interface AssignOrganizationMemberResponseBody {
  success: boolean;
  message?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped so they
// do not collide with same-named interfaces in other spec files.
export {};

// crypto.randomUUID() is unavailable in the spec's browser context (the auth
// server is not served from a secure context in CI; see
// apis/OrgMemberCannotAddApiServerDomain.cy.ts for the same workaround).
function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe("GET /apis/:api_server_id/jwks-access-keys page for org-member (non-owner/admin) caller", () => {
  it("redirects to /error?error=403&error_id=forbidden when the caller's only org membership is role 'member'", () => {
    cy.generate_random_test_user_credentials().then((memberCredentials) => {
      // 1. Create the member's account first, so the direct member
      //    assignment below can resolve their e-mail address to a user.
      cy.create_and_login_as_regular_user_via_request(memberCredentials).then(
        (memberCreated: boolean) => {
          expect(memberCreated, "member user creation should succeed").to.be
            .true;
          cy.logout_via_request();

          // 2. The superuser is a platform admin, so it can create the
          //    organization, its API server, and the membership without
          //    needing any org-level role of its own.
          cy.create_and_login_as_superuser_via_request().then(
            (adminLoggedIn: boolean) => {
              expect(adminLoggedIn, "superuser login should succeed").to.be
                .true;

              cy.generate_random_code(12).then((randomCode: string) => {
                const organization_id = `jwks-page-member-${randomCode.toLowerCase()}`;
                const name = `JWKS Page Member Org ${randomCode}`;

                cy.create_organization_via_request({
                  organization_id,
                  name,
                }).then(() => {
                  // 3. A PRIVATE, organization-owned API server: the
                  //    ownership shape the page's `canUserManageResource`
                  //    gate resolves against an org membership role.
                  const api_server_id: string = generateV4Uuid();
                  cy.request<CreateApiServerResponseBody>({
                    method: "POST",
                    url: "/api/apis",
                    body: {
                      api_server_id,
                      api_server_name: `JWKS Page Member ${randomCode}`,
                      api_server_description: `API server for the JWKS-access-keys page member E2E test ${randomCode}`,
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
                    expect(createApiResp.body).to.have.property(
                      "success",
                      true,
                    );
                    expect(createApiResp.body.resource_id).to.eq(api_server_id);

                    // 4. Add the regular user to the organization with role
                    //    'member' — the precondition under test. Platform
                    //    admins may assign members directly, which keeps
                    //    this spec's setup to one request instead of the
                    //    invite + accept round trip.
                    cy.request<AssignOrganizationMemberResponseBody>({
                      method: "POST",
                      url: `/api/organizations/${organization_id}/members`,
                      body: {
                        input_mode: "email",
                        identifier: memberCredentials.email,
                        role: "member",
                      },
                    }).then((assignResp) => {
                      expect(
                        assignResp.status,
                        "superuser should be able to add the user to the org as a 'member'",
                      ).to.be.oneOf([200, 201]);
                      expect(assignResp.body).to.have.property("success", true);

                      // 5. Switch to the member and load the page.
                      cy.logout_via_request();
                      cy.login_via_request(
                        memberCredentials.email,
                        memberCredentials.password,
                      ).then((memberLoggedIn: boolean) => {
                        expect(
                          memberLoggedIn,
                          "member should be able to log in",
                        ).to.be.true;

                        cy.visit(
                          `/apis/${api_server_id}/jwks-access-keys`,
                          { failOnStatusCode: false },
                        );

                        // The page must not render for an org 'member': the
                        // guard redirects to the branded error page.
                        cy.url().should("include", "/error");
                        cy.url().should("include", "error=403");
                        cy.url().should("include", "error_id=forbidden");
                        cy.url().should(
                          "not.include",
                          `/apis/${api_server_id}/jwks-access-keys`,
                        );
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
