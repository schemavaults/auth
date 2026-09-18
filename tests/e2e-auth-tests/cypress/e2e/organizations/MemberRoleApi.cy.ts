// Covers the organization member-role endpoints beyond what the existing
// specs pin (401, the `admin` role refusal and last-owner protection):
//   GET   /api/organizations/[organization_id]/members/[uid]/role
//         -> previously only its 401 was tested: owner and member reads,
//            403 for a non-member caller, 404 for a non-member target,
//            400 for malformed ids, global-admin bypass
//   PATCH /api/organizations/[organization_id]/members/[uid]/role
//         -> 403 for a plain member and for a non-member caller,
//            400 for an unknown role / missing body, owner->member demotion
// The organization is created by a regular user (who becomes its owner) and
// the second member joins through a uid-mode invitation accepted by request.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface RoleResponseBody {
  success: boolean;
  message?: string;
  data?: { role: string };
}

interface CreateInvitationResponseBody {
  success: boolean;
  data?: { invitation: { invitation_id: string } };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

interface User {
  email: string;
  password: string;
  uid: string;
}

interface Fixture {
  organization_id: string;
  owner: User;
  member: User;
  outsider: User;
}

/** Registers a fresh regular user via request and logs them out again. */
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
        return cy.wrap<User>({ ...credentials, uid }, { log: false });
      }),
  );
}

function loginAs(user: User): void {
  cy.login_via_request(user.email, user.password).then((ok: boolean) =>
    expect(ok, `login as ${user.email}`).to.be.true,
  );
}

/** Builds an org (owner) + member + outsider; leaves the session logged out. */
function setup(): Cypress.Chainable<Fixture> {
  const organization_id = `e2e-role-${Math.random().toString(36).slice(2, 10)}`;
  return registerUser().then((owner) =>
    registerUser().then((member) =>
      registerUser().then((outsider) => {
        loginAs(owner);
        cy.create_organization_via_request({
          organization_id,
          name: `Member role org ${organization_id}`,
        });
        return cy
          .request<CreateInvitationResponseBody>({
            method: "POST",
            url: `/api/organizations/${organization_id}/invitations`,
            body: { input_mode: "uid", identifier: member.uid },
          })
          .then((invite) => {
            expect(invite.status).to.eq(201);
            const invitation_id = invite.body.data?.invitation.invitation_id;
            cy.logout();
            loginAs(member);
            cy.request({
              method: "PATCH",
              url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
              body: { action: "accept" },
            }).then((response) => expect(response.status).to.eq(200));
            cy.logout();
            return cy.wrap<Fixture>(
              { organization_id, owner, member, outsider },
              { log: false },
            );
          });
      }),
    ),
  );
}

function getRole(
  organization_id: string,
  uid: string,
): Cypress.Chainable<Cypress.Response<RoleResponseBody>> {
  return cy.request<RoleResponseBody>({
    method: "GET",
    url: `/api/organizations/${organization_id}/members/${uid}/role`,
    failOnStatusCode: false,
  });
}

function patchRole(
  organization_id: string,
  uid: string,
  body: Cypress.RequestBody,
): Cypress.Chainable<Cypress.Response<RoleResponseBody>> {
  return cy.request<RoleResponseBody>({
    method: "PATCH",
    url: `/api/organizations/${organization_id}/members/${uid}/role`,
    body,
    failOnStatusCode: false,
  });
}

describe("Organization member role API", () => {
  it("GET returns roles to members, 403 to outsiders, 404 for non-member targets and 400 for malformed ids", () => {
    setup().then(({ organization_id, owner, member, outsider }) => {
      loginAs(owner);
      getRole(organization_id, member.uid).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data?.role).to.eq("member");
      });
      getRole(organization_id, outsider.uid).then((response) => {
        expect(response.status, "target is not a member").to.eq(404);
      });
      getRole(organization_id, "not-a-uuid").then((response) => {
        expect(response.status, "malformed uid").to.eq(400);
      });
      getRole("!!", owner.uid).then((response) => {
        expect(response.status, "malformed organization id").to.eq(400);
      });
      cy.logout();

      loginAs(member);
      getRole(organization_id, owner.uid).then((response) => {
        expect(response.status, "member reads the owner's role").to.eq(200);
        expect(response.body.data?.role).to.eq("owner");
      });
      cy.logout();

      loginAs(outsider);
      getRole(organization_id, owner.uid).then((response) => {
        expect(response.status, "outsider").to.eq(403);
        expect(response.body.success).to.eq(false);
      });
      cy.logout();

      cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
        if (!ok) throw new Error("Failed to login as superuser");
        getRole(organization_id, member.uid).then((response) => {
          expect(response.status, "global admin bypass").to.eq(200);
          expect(response.body.data?.role).to.eq("member");
        });
        cy.delete_organization({ organization_id });
      });
    });
  });

  it("PATCH is owner-only, validates the role, and supports promotion and demotion", () => {
    setup().then(({ organization_id, owner, member, outsider }) => {
      loginAs(member);
      patchRole(organization_id, owner.uid, { role: "member" }).then(
        (response) => {
          expect(response.status, "plain member changing a role").to.eq(403);
          expect(response.body.success).to.eq(false);
        },
      );
      cy.logout();

      loginAs(outsider);
      patchRole(organization_id, member.uid, { role: "owner" }).then(
        (response) => {
          expect(response.status, "non-member changing a role").to.eq(403);
        },
      );
      cy.logout();

      loginAs(owner);
      patchRole(organization_id, member.uid, { role: "viewer" }).then(
        (response) => {
          expect(response.status, "unknown role").to.eq(400);
        },
      );
      patchRole(organization_id, member.uid, {}).then((response) => {
        expect(response.status, "missing role field").to.eq(400);
      });
      patchRole(organization_id, "not-a-uuid", { role: "owner" }).then(
        (response) => {
          expect(response.status, "malformed uid").to.eq(400);
        },
      );
      patchRole(organization_id, outsider.uid, { role: "owner" }).then(
        (response) => {
          expect(response.status, "target is not a member").to.eq(404);
          expect(response.body.success).to.eq(false);
        },
      );

      patchRole(organization_id, member.uid, { role: "owner" }).then(
        (response) => {
          expect(response.status, "promotion").to.eq(200);
          expect(response.body.success).to.eq(true);
        },
      );
      getRole(organization_id, member.uid).then((response) => {
        expect(response.body.data?.role).to.eq("owner");
      });
      patchRole(organization_id, member.uid, { role: "member" }).then(
        (response) => {
          expect(response.status, "demotion of a second owner").to.eq(200);
        },
      );
      getRole(organization_id, member.uid).then((response) => {
        expect(response.body.data?.role).to.eq("member");
      });
      cy.delete_organization({ organization_id });
    });
  });
});
