// Verifies that a domain can be detached from a client application on the
// app's detail page (/apps/:app_id, "Connected Domains" card) and through
// DELETE /api/apps/:app_id/domains/:app_domain_ref_id, and that read-only
// viewers can do neither.
//
//   1. The superuser (a global admin) creates an organization-owned app with
//      two domains, and invites a regular user into the organization as a
//      plain MEMBER (role === "member").
//   2. The member can view the detail page but sees no remove control, and
//      the DELETE route answers 403 (the same management gate as adding a
//      domain, see apps/OrgMemberCannotAddAppDomain.cy.ts).
//   3. Back as the superuser: an unknown domain ref id answers 404; removing
//      one domain from the Connected Domains card drops it from the page and
//      from GET /api/apps/:app_id/domains while the other domain stays.
//
// The unauthenticated (401) case is in misc/UnauthenticatedApiRequests.cy.ts.

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

interface ApiResponseBody {
  success: boolean;
  message?: string;
}

interface ListAppDomainsResponseBody {
  success: boolean;
  list: Array<{ app_domain_ref_id: string; domain: string; environment: string }>;
}

// Module marker: keeps this spec's top-level interfaces file-scoped so they
// do not collide with same-named interfaces in other spec files.
export {};

// crypto.randomUUID() is unavailable in the spec's browser context (the
// auth server is not served from a secure context in CI). Generate an
// RFC4122 v4 UUID with Math.random instead — the ids feed `z.guid()`
// validators on the auth-server, so the format must be valid.
function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const dialogContentId = "remove-app-domain-dialog-content";
const confirmButtonSelector = "button#confirm-remove-app-domain-button";

function addDomainViaRequest(
  app_id: string,
  app_domain_ref_id: string,
  domain: string,
): void {
  cy.request<ApiResponseBody>({
    method: "POST",
    url: `/api/apps/${app_id}/domains`,
    body: {
      app_domain_ref_id,
      app_id,
      domain,
      environment: "test",
      created_at: Date.now(),
      hardcoded: false,
    },
  }).then((resp) => {
    expect(resp.status, `adding ${domain} should succeed`).to.eq(200);
  });
}

describe("Removing a domain from an app (/apps/:app_id)", () => {
  it("lets a manager remove a domain from the Connected Domains card, and refuses a read-only org member", () => {
    cy.generate_random_test_user_credentials().then((memberCredentials) => {
      cy.create_and_login_as_regular_user_via_request(memberCredentials).then(
        (memberCreated: boolean) => {
          expect(memberCreated, "member user creation should succeed").to.be
            .true;
        },
      );
      cy.logout();

      cy.create_and_login_as_superuser_via_request().then(
        (adminLoggedIn: boolean) => {
          expect(adminLoggedIn, "superuser login should succeed").to.be.true;
        },
      );

      cy.generate_random_code(12).then((randomCode: string) => {
        const lowerCode = randomCode.toLowerCase();
        const organization_id = `app-rm-dom-${lowerCode}`;
        const app_id: string = generateV4Uuid();
        const removed = {
          app_domain_ref_id: generateV4Uuid(),
          domain: `https://remove-${lowerCode}.example.test`,
        };
        const kept = {
          app_domain_ref_id: generateV4Uuid(),
          domain: `https://keep-${lowerCode}.example.test`,
        };

        // 1. An organization-owned private app with two domains, and an
        //    invitation for the member.
        cy.create_organization_via_request({
          organization_id,
          name: `App Remove Domain Org ${randomCode}`,
        });
        cy.request<ApiResponseBody>({
          method: "POST",
          url: "/api/apps",
          body: {
            app_id,
            app_name: `App Remove Domain ${randomCode}`,
            app_description: `App for domain removal E2E test ${randomCode}`,
            created_at: Date.now(),
            public: false,
            hardcoded: false,
            web: true,
            owner_organization_id: organization_id,
          },
        }).then((createAppResp) => {
          expect(createAppResp.status, "app creation should succeed").to.eq(
            200,
          );
        });
        addDomainViaRequest(app_id, removed.app_domain_ref_id, removed.domain);
        addDomainViaRequest(app_id, kept.app_domain_ref_id, kept.domain);

        cy.request<CreateInvitationResponseBody>({
          method: "POST",
          url: `/api/organizations/${organization_id}/invitations`,
          body: { input_mode: "email", identifier: memberCredentials.email },
        }).then((createInviteResp) => {
          expect(createInviteResp.status, "invitation should be created").to.eq(
            201,
          );
          const invitation_id =
            createInviteResp.body.data?.invitation.invitation_id;
          if (!invitation_id) {
            throw new Error(
              "Expected the create-invitation response to include an invitation_id",
            );
          }

          cy.logout();
          cy.login_via_request(
            memberCredentials.email,
            memberCredentials.password,
          ).then((memberLoggedIn: boolean) => {
            expect(memberLoggedIn, "member should be able to log in").to.be
              .true;
          });
          cy.request<ApiResponseBody>({
            method: "PATCH",
            url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
            body: { action: "accept" },
          }).then((acceptResp) => {
            expect(acceptResp.status, "member should accept the invitation").to
              .eq(200);
          });

          // 2. The member sees the domains but no remove control, and the
          //    route refuses them.
          cy.visit(`/apps/${app_id}`);
          cy.wait_for_page_hydration();
          cy.contains("Connected Domains").should("be.visible");
          cy.contains("p", removed.domain).should("exist");
          cy.get(`button[id^="remove-app-domain-button-"]`).should("not.exist");

          cy.request<ApiResponseBody>({
            method: "DELETE",
            url: `/api/apps/${app_id}/domains/${removed.app_domain_ref_id}`,
            failOnStatusCode: false,
          }).then((memberDeleteResp) => {
            expect(
              memberDeleteResp.status,
              "org-member (non-owner, non-admin) DELETE should return 403",
            ).to.eq(403);
            expect(memberDeleteResp.body).to.have.property("success", false);
            expect(
              String(memberDeleteResp.body.message ?? "").toLowerCase(),
            ).to.include("owner");
          });

          // 3. As the superuser.
          cy.logout();
          cy.create_and_login_as_superuser_via_request().then(
            (adminLoggedIn: boolean) => {
              expect(adminLoggedIn, "superuser login should succeed").to.be
                .true;
            },
          );

          cy.request<ApiResponseBody>({
            method: "DELETE",
            url: `/api/apps/${app_id}/domains/${generateV4Uuid()}`,
            failOnStatusCode: false,
          }).then((unknownRefResp) => {
            expect(
              unknownRefResp.status,
              "an unknown domain ref id should return 404",
            ).to.eq(404);
            expect(unknownRefResp.body).to.have.property("success", false);
          });

          cy.visit(`/apps/${app_id}`);
          cy.wait_for_page_hydration();
          cy.contains("Connected Domains").should("be.visible");

          cy.open_dialog_with_button(
            `remove-app-domain-button-${removed.app_domain_ref_id}`,
            dialogContentId,
          );
          cy.get(`#${dialogContentId}`).should("contain.text", removed.domain);

          cy.intercept({
            method: "DELETE",
            url: `**/api/apps/${app_id}/domains/${removed.app_domain_ref_id}`,
            times: 1,
          }).as("removeAppDomainRequest");

          cy.get(confirmButtonSelector)
            .should("be.visible")
            .should("not.be.disabled")
            .click();

          cy.wait("@removeAppDomainRequest", {
            timeout: 20000,
            requestTimeout: 20000,
          }).then((interception) => {
            cy.wrap(interception.response?.statusCode).should(
              "eq",
              200,
              "Remove app domain request should return 200",
            );
          });

          // The page refreshes its server-rendered domain list after the
          // dialog succeeds: the removed row disappears, the other stays.
          cy.get(`#${dialogContentId}`).should("not.exist");
          cy.contains("p", removed.domain, { timeout: 20000 }).should(
            "not.exist",
          );
          cy.get(
            `button#remove-app-domain-button-${removed.app_domain_ref_id}`,
          ).should("not.exist");
          cy.contains("p", kept.domain).should("exist");
          cy.get(
            `button#remove-app-domain-button-${kept.app_domain_ref_id}`,
          ).should("exist");

          cy.request<ListAppDomainsResponseBody>(
            `/api/apps/${app_id}/domains`,
          ).then((listResponse) => {
            expect(listResponse.status).to.eq(200);
            const ref_ids = listResponse.body.list.map(
              (d) => d.app_domain_ref_id,
            );
            expect(ref_ids, "the removed domain should be gone").to.not.include(
              removed.app_domain_ref_id,
            );
            expect(ref_ids, "the other domain should remain").to.include(
              kept.app_domain_ref_id,
            );
          });
        });
      });
    });
  });
});
