// Contract coverage for organization API branches no other spec reaches:
//   POST /api/organizations
//        -> body validation (400), the admin_only_organization_creation
//           server setting (403), the per-user membership limit (409)
//   DELETE /api/organizations/[organization_id]
//        -> 400 malformed id, 403 for a plain member, 404 for an admin
//           deleting an unknown organization
//   GET/POST /api/organizations/[organization_id]/invitations
//        -> 403 for a plain member (owner-only), POST body validation,
//           uid input mode (201), unknown email/uid (404)
//   GET /api/me/organizations/[organization_id]/role -> 400 malformed id
//   OPTIONS /api/me/organizations -> CORS preflight

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import { MAXIMUM_USER_ORGANIZATIONS } from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface ApiResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
  data?: Record<string, unknown>;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function randomOrgId(prefix = "e2e-orgv"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function orgBody(organization_id: string) {
  return {
    organization_id,
    name: `Validation org ${organization_id}`,
    created_at: Date.now(),
  };
}

interface User {
  email: string;
  password: string;
  uid: string;
}

function registerUser(): Cypress.Chainable<User> {
  return cy.generate_random_test_user_credentials().then((credentials) =>
    cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((ok: boolean) => {
        expect(ok, "registration").to.be.true;
        return cy.request({
          method: "GET",
          url: `/api/auth/whoami/${AUTH_APP_ID}`,
        });
      })
      .then((whoami) => {
        const uid: string = whoami.body.user.uid;
        cy.logout();
        return { ...credentials, uid };
      }),
  );
}

function loginAs(user: User): void {
  cy.login_via_request(user.email, user.password).then((ok: boolean) =>
    expect(ok, `login as ${user.email}`).to.be.true,
  );
}

describe("Organization API validation", () => {
  describe("POST /api/organizations", () => {
    it("rejects malformed bodies", () => {
      registerUser().then((user) => {
        loginAs(user);
        const cases: Array<{ label: string; body: Cypress.RequestBody }> = [
          { label: "missing name and created_at", body: { organization_id: randomOrgId() } },
          { label: "organization id too short", body: orgBody("x") },
          { label: "organization id with invalid characters", body: orgBody("Bad Org!") },
          { label: "reserved organization id", body: orgBody("create") },
        ];
        for (const { label, body } of cases) {
          cy.request<ApiResponseBody>({
            method: "POST",
            url: "/api/organizations",
            body,
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, label).to.eq(400);
            expect(response.body.success, label).to.eq(false);
          });
        }
        cy.request<ApiResponseBody>({
          method: "POST",
          url: "/api/organizations",
          headers: { "content-type": "application/json" },
          body: "{not json",
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "non-JSON body").to.eq(400);
        });
      });
    });

    it("refuses non-admins while admin_only_organization_creation is enabled", () => {
      const SETTING = "admin_only_organization_creation";
      registerUser().then((user) => {
        cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
          if (!ok) throw new Error("Failed to login as superuser");
          cy.request({
            method: "PATCH",
            url: `/api/admin/settings/${SETTING}`,
            body: { value: true },
          }).then((response) => expect(response.status).to.eq(200));
          cy.logout();
        });

        loginAs(user);
        cy.request<ApiResponseBody>({
          method: "POST",
          url: "/api/organizations",
          body: orgBody(randomOrgId()),
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.eq(403);
          expect(response.body.success).to.eq(false);
        });
        cy.logout();

        // Restore the default so later specs can create organizations.
        cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
          if (!ok) throw new Error("Failed to login as superuser");
          cy.request({
            method: "PATCH",
            url: `/api/admin/settings/${SETTING}`,
            body: { value: false },
          }).then((response) => expect(response.status).to.eq(200));
        });
      });
    });

    it(`returns 409 once a user belongs to ${MAXIMUM_USER_ORGANIZATIONS} organizations`, () => {
      registerUser().then((user) => {
        loginAs(user);
        const created: string[] = [];
        for (let i = 0; i < MAXIMUM_USER_ORGANIZATIONS; i++) {
          const organization_id = randomOrgId(`e2e-lim${i}`);
          cy.request<ApiResponseBody>({
            method: "POST",
            url: "/api/organizations",
            body: orgBody(organization_id),
          }).then((response) => {
            expect(response.status, `organization #${i + 1}`).to.eq(200);
            created.push(organization_id);
          });
        }
        cy.request<ApiResponseBody>({
          method: "POST",
          url: "/api/organizations",
          body: orgBody(randomOrgId("e2e-limx")),
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "one past the limit").to.eq(409);
          expect(response.body.success).to.eq(false);
        });
        cy.wrap(null, { log: false }).then(() => {
          for (const organization_id of created) {
            cy.delete_organization({ organization_id });
          }
        });
      });
    });
  });

  describe("owner-only organization endpoints as a plain member", () => {
    it("returns 403 on invitation listing/creation and organization deletion", () => {
      const organization_id = randomOrgId();
      registerUser().then((owner) => {
        registerUser().then((member) => {
          loginAs(owner);
          cy.create_organization_via_request({
            organization_id,
            name: `Member guard org ${organization_id}`,
          });
          cy.request({
            method: "POST",
            url: `/api/organizations/${organization_id}/invitations`,
            body: { input_mode: "uid", identifier: member.uid },
          }).then((invite) => {
            expect(invite.status).to.eq(201);
            const invitation_id: string = invite.body.data.invitation.invitation_id;
            cy.logout();
            loginAs(member);
            cy.request({
              method: "PATCH",
              url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
              body: { action: "accept" },
            }).then((response) => expect(response.status).to.eq(200));
          });

          cy.request({
            method: "GET",
            url: `/api/organizations/${organization_id}/invitations`,
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "member lists invitations").to.eq(403);
          });
          cy.request({
            method: "POST",
            url: `/api/organizations/${organization_id}/invitations`,
            body: { input_mode: "uid", identifier: owner.uid },
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "member creates invitation").to.eq(403);
          });
          cy.delete_organization({ organization_id }).then((result) => {
            expect(result.status_code, "member deletes organization").to.eq(403);
          });
          cy.logout();

          loginAs(owner);
          cy.delete_organization({ organization_id }).then((result) => {
            expect(result.success, "owner deletes organization").to.eq(true);
          });
        });
      });
    });
  });

  describe("DELETE /api/organizations/:organization_id", () => {
    it("returns 400 for a malformed id and 404 for an unknown organization (as admin)", () => {
      cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
        if (!ok) throw new Error("Failed to login as superuser");
        cy.delete_organization({ organization_id: "!!" }).then((result) => {
          expect(result.status_code).to.eq(400);
        });
        cy.delete_organization({
          organization_id: "e2e-does-not-exist-xyz",
        }).then((result) => {
          expect(result.status_code).to.eq(404);
        });
      });
    });
  });

  describe("POST /api/organizations/:organization_id/invitations", () => {
    it("validates the body, resolves invitees by uid, and 404s unknown identifiers", () => {
      const organization_id = randomOrgId();
      registerUser().then((invitee) => {
        cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
          if (!ok) throw new Error("Failed to login as superuser");
          cy.create_organization_via_request({
            organization_id,
            name: `Invite validation org ${organization_id}`,
          });
          const url = `/api/organizations/${organization_id}/invitations`;
          const badBodies: Array<{ label: string; body: Cypress.RequestBody }> = [
            { label: "unknown input_mode", body: { input_mode: "phone", identifier: "x" } },
            { label: "uid mode with a non-uuid", body: { input_mode: "uid", identifier: "not-a-uuid" } },
            { label: "email mode with a non-email", body: { input_mode: "email", identifier: "not-an-email" } },
            { label: "empty body", body: {} },
          ];
          for (const { label, body } of badBodies) {
            cy.request<ApiResponseBody>({
              method: "POST",
              url,
              body,
              failOnStatusCode: false,
            }).then((response) => {
              expect(response.status, label).to.eq(400);
              expect(response.body.success, label).to.eq(false);
            });
          }
          cy.request<ApiResponseBody>({
            method: "POST",
            url,
            body: {
              input_mode: "email",
              identifier: `nobody-${Date.now()}@example.com`,
            },
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "unknown email").to.eq(404);
          });
          cy.request<ApiResponseBody>({
            method: "POST",
            url,
            body: {
              input_mode: "uid",
              identifier: "00000000-0000-0000-0000-000000000099",
            },
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "unknown uid").to.eq(404);
          });
          cy.request<ApiResponseBody>({
            method: "POST",
            url: `/api/organizations/!!/invitations`,
            body: { input_mode: "uid", identifier: invitee.uid },
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "malformed organization id").to.eq(400);
          });
          cy.request<ApiResponseBody>({
            method: "POST",
            url,
            body: { input_mode: "uid", identifier: invitee.uid },
          }).then((response) => {
            expect(response.status, "uid input mode").to.eq(201);
            expect(response.body.success).to.eq(true);
            const invitation = response.body.data?.invitation as
              | { invitee_uid: string; status: string; organization_id: string }
              | undefined;
            expect(invitation?.invitee_uid).to.eq(invitee.uid);
            expect(invitation?.organization_id).to.eq(organization_id);
            expect(invitation?.status).to.eq("pending");
          });
          cy.delete_organization({ organization_id });
        });
      });
    });
  });

  describe("/api/me/organizations", () => {
    it("GET /api/me/organizations/:organization_id/role returns 400 for a malformed id", () => {
      registerUser().then((user) => {
        loginAs(user);
        cy.request({
          method: "GET",
          url: "/api/me/organizations/!!/role",
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.eq(400);
          expect(response.body).to.have.property("success", false);
        });
      });
    });

    it("OPTIONS /api/me/organizations answers preflights: credentialed for the auth server origin, wildcard otherwise", () => {
      const ownOrigin = new URL(Cypress.config("baseUrl")!).origin;
      cy.request({
        method: "OPTIONS",
        url: "/api/me/organizations",
        headers: { Origin: ownOrigin },
      }).then((response) => {
        expect(response.status).to.eq(204);
        expect(response.headers["access-control-allow-origin"]).to.eq(ownOrigin);
        expect(response.headers["access-control-allow-credentials"]).to.eq("true");
      });
      cy.request({
        method: "OPTIONS",
        url: "/api/me/organizations",
        headers: { Origin: "https://third-party.example" },
      }).then((response) => {
        expect(response.status).to.eq(204);
        expect(response.headers["access-control-allow-origin"]).to.eq("*");
        expect(response.headers["access-control-allow-methods"]).to.include("GET");
        expect(String(response.headers["vary"])).to.include("Origin");
      });
    });
  });
});
