// POST /api/organizations/[organization_id]/members as a platform
// administrator: adds an existing user to an organization immediately, with
// no invitation to accept. Pins
//   - 201 + the `{ member, revoked_invitation_ids }` envelope, by e-mail
//     (default role `member`) or by uid (role `owner`), the administrator
//     adding themselves included, and `text/plain` JSON bodies,
//   - that the user is a member right away (their own /api/me/organizations
//     and the members list),
//   - 409 for a user who already is a member,
//   - that the user's pending invitation to the organization is revoked
//     (it can no longer be accepted, so no second membership row appears),
//   - 400 for invalid bodies (the virtual `admin` role included) and for
//     service accounts, 404 for unknown users / organizations and 403 for
//     the system organization.
// The authorization gate (non-admins are always refused) is pinned by
// DirectMemberAssignmentAuthorization.cy.ts.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();
const SYSTEM_ORGANIZATION_ID = "schemavaults";

interface User {
  email: string;
  password: string;
  uid: string;
}

interface AssignResponseBody {
  success: boolean;
  message: string;
  data?: {
    member: {
      membership_declaration_id: string;
      organization_id: string;
      uid: string;
      role: string;
      membership_created_at: number;
      email: string;
    };
    revoked_invitation_ids: string[];
  };
}

interface MyOrganizationsResponseBody {
  success: boolean;
  data?: { memberships: Array<{ organization_id: string; role: string }> };
}

interface MembersResponseBody {
  success: boolean;
  data?: { members: Array<{ uid: string; role: string }> };
}

interface CreateInvitationResponseBody {
  success: boolean;
  data?: { invitation: { invitation_id: string } };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

/** The signed-in user's uid. */
function currentUid(): Cypress.Chainable<string> {
  return cy
    .request<{ user: { uid: string } }>(`/api/auth/whoami/${AUTH_APP_ID}`)
    .then((response) => response.body.user.uid);
}

/** Registers a fresh regular user via request and logs them out again. */
function registerUser(): Cypress.Chainable<User> {
  return cy.generate_random_test_user_credentials().then((credentials) =>
    cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((ok: boolean) => {
        expect(ok, "registration").to.be.true;
        return currentUid();
      })
      .then((uid: string) => {
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

function loginAsSuperuser(): void {
  cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
    if (!ok) throw new Error("Failed to login as superuser");
  });
}

function randomOrganizationId(): string {
  return `e2e-admin-assign-${Math.random().toString(36).slice(2, 10)}`;
}

function assign(
  organization_id: string,
  body: Cypress.RequestBody,
  headers: Record<string, string> = {},
): Cypress.Chainable<Cypress.Response<AssignResponseBody>> {
  return cy.request<AssignResponseBody>({
    method: "POST",
    url: `/api/organizations/${organization_id}/members`,
    body,
    headers,
    failOnStatusCode: false,
  });
}

/** The signed-in user's role in each of their organizations. */
function myRoles(): Cypress.Chainable<Record<string, string>> {
  return cy
    .request<MyOrganizationsResponseBody>("/api/me/organizations")
    .then((response) => {
      expect(response.status).to.eq(200);
      return Object.fromEntries(
        (response.body.data?.memberships ?? []).map((m) => [
          m.organization_id,
          m.role,
        ]),
      );
    });
}

describe("Admin direct organization member assignment API", () => {
  it("adds a user by e-mail as a member immediately and refuses duplicates (409)", () => {
    const organization_id = randomOrganizationId();
    registerUser().then((target) => {
      loginAsSuperuser();
      cy.create_organization_via_request({
        organization_id,
        name: `Admin assignment ${organization_id}`,
      });

      // No role: defaults to `member`. E-mail lookup is case-insensitive.
      assign(organization_id, {
        input_mode: "email",
        identifier: target.email.toUpperCase(),
      }).then((response) => {
        expect(response.status).to.eq(201);
        expect(response.body.success).to.eq(true);
        expect(response.body.message).to.be.a("string").and.not.be.empty;
        const member = response.body.data?.member;
        expect(member?.uid).to.eq(target.uid);
        expect(member?.organization_id).to.eq(organization_id);
        expect(member?.role).to.eq("member");
        expect(member?.email).to.eq(target.email.toLowerCase());
        expect(member?.membership_declaration_id).to.be.a("string").and.not.be.empty;
        expect(member?.membership_created_at).to.be.a("number");
        expect(response.body.data?.revoked_invitation_ids).to.deep.eq([]);
      });

      // Already a member, however the user is named.
      assign(organization_id, {
        input_mode: "uid",
        identifier: target.uid,
        role: "owner",
      }).then((response) => {
        expect(response.status).to.eq(409);
        expect(response.body.success).to.eq(false);
      });
      cy.request<MembersResponseBody>(
        `/api/organizations/${organization_id}/members`,
      ).then((response) => {
        const targetRows = (response.body.data?.members ?? []).filter(
          (m) => m.uid === target.uid,
        );
        expect(targetRows, "a single membership row").to.have.length(1);
        expect(targetRows[0]?.role, "role unchanged").to.eq("member");
      });
      cy.logout();

      // The user is a member right away: no invitation to accept.
      loginAs(target);
      myRoles().then((roles) => expect(roles[organization_id]).to.eq("member"));
      cy.request(`/api/organizations/${organization_id}/members`)
        .its("status")
        .should("eq", 200);
      cy.logout();

      loginAsSuperuser();
      cy.delete_organization({ organization_id });
    });
  });

  it("lets an administrator add themselves by uid as owner (text/plain body)", () => {
    const organization_id = randomOrganizationId();
    registerUser().then((creator) => {
      // Someone else's organization, which the administrator is not in.
      loginAs(creator);
      cy.create_organization_via_request({
        organization_id,
        name: `Admin self assignment ${organization_id}`,
      });
      cy.logout();

      loginAsSuperuser();
      myRoles().then((roles) =>
        expect(roles, "not a member yet").to.not.have.property(organization_id),
      );
      currentUid().then((admin_uid) => {
        assign(
          organization_id,
          JSON.stringify({ input_mode: "uid", identifier: admin_uid, role: "owner" }),
          { "Content-Type": "text/plain;charset=UTF-8" },
        ).then((response) => {
          expect(response.status).to.eq(201);
          expect(response.body.data?.member.uid).to.eq(admin_uid);
          expect(response.body.data?.member.role).to.eq("owner");
        });
        myRoles().then((roles) => expect(roles[organization_id]).to.eq("owner"));
        cy.request(
          `/api/organizations/${organization_id}/members/${admin_uid}/role`,
        )
          .its("body.data.role")
          .should("eq", "owner");
      });
      cy.delete_organization({ organization_id });
    });
  });

  it("revokes the user's pending invitation, which can then no longer be accepted", () => {
    const organization_id = randomOrganizationId();
    registerUser().then((owner) =>
      registerUser().then((target) => {
        loginAs(owner);
        cy.create_organization_via_request({
          organization_id,
          name: `Admin assignment invitation ${organization_id}`,
        });
        cy.request<CreateInvitationResponseBody>({
          method: "POST",
          url: `/api/organizations/${organization_id}/invitations`,
          body: { input_mode: "uid", identifier: target.uid },
        }).then((invite) => {
          expect(invite.status).to.eq(201);
          const invitation_id = invite.body.data?.invitation.invitation_id;
          expect(invitation_id).to.be.a("string");
          cy.logout();

          loginAsSuperuser();
          assign(organization_id, {
            input_mode: "uid",
            identifier: target.uid,
            role: "owner",
          }).then((response) => {
            expect(response.status).to.eq(201);
            expect(response.body.data?.member.role).to.eq("owner");
            expect(response.body.data?.revoked_invitation_ids).to.deep.eq([
              invitation_id,
            ]);
          });
          cy.logout();

          loginAs(target);
          cy.request<{ data?: { invitations: Array<{ invitation_id: string }> } }>(
            "/api/me/invitations",
          ).then((response) => {
            const ids = (response.body.data?.invitations ?? []).map(
              (i) => i.invitation_id,
            );
            expect(ids, "no longer pending").to.not.include(invitation_id);
          });
          cy.request({
            method: "PATCH",
            url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
            body: { action: "accept" },
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "accepting a revoked invitation").to.eq(400);
            expect(response.body.success).to.eq(false);
          });
          myRoles().then((roles) =>
            expect(roles[organization_id], "role from the assignment").to.eq("owner"),
          );
          cy.logout();

          loginAs(owner);
          cy.request<{ data?: { invitations: Array<{ invitation_id: string; status: string }> } }>(
            `/api/organizations/${organization_id}/invitations`,
          ).then((response) => {
            const invitation = (response.body.data?.invitations ?? []).find(
              (i) => i.invitation_id === invitation_id,
            );
            expect(invitation?.status).to.eq("revoked");
          });
          cy.request<MembersResponseBody>(
            `/api/organizations/${organization_id}/members`,
          ).then((response) => {
            const targetRows = (response.body.data?.members ?? []).filter(
              (m) => m.uid === target.uid,
            );
            expect(targetRows, "a single membership row").to.have.length(1);
          });
          cy.logout();

          loginAsSuperuser();
          cy.delete_organization({ organization_id });
        });
      }),
    );
  });

  it("validates the body and refuses unknown users, unknown organizations, system organizations and service accounts", () => {
    const organization_id = randomOrganizationId();
    const app_id = `e2e-assign-sa-${Math.random().toString(36).slice(2, 8)}`;
    registerUser().then((target) => {
      loginAsSuperuser();
      cy.create_organization_via_request({
        organization_id,
        name: `Admin assignment validation ${organization_id}`,
      });

      // Invalid bodies (400).
      assign(organization_id, {
        input_mode: "uid",
        identifier: target.uid,
        role: "admin",
      }).then((response) => expect(response.status, "virtual admin role").to.eq(400));
      assign(organization_id, {
        input_mode: "uid",
        identifier: target.uid,
        role: "viewer",
      }).then((response) => expect(response.status, "unknown role").to.eq(400));
      assign(organization_id, {
        input_mode: "uid",
        identifier: target.email,
      }).then((response) => expect(response.status, "e-mail given as uid").to.eq(400));
      assign(organization_id, {
        input_mode: "email",
        identifier: target.uid,
      }).then((response) => expect(response.status, "uid given as e-mail").to.eq(400));
      assign(organization_id, { input_mode: "email" }).then((response) =>
        expect(response.status, "missing identifier").to.eq(400),
      );
      assign("!!", { input_mode: "uid", identifier: target.uid }).then((response) =>
        expect(response.status, "malformed organization id").to.eq(400),
      );

      // Unknown users and organizations (404).
      assign(organization_id, {
        input_mode: "email",
        identifier: `nobody-${Date.now()}@example.com`,
      }).then((response) => expect(response.status, "unknown e-mail").to.eq(404));
      assign(organization_id, {
        input_mode: "uid",
        identifier: "00000000-0000-4000-8000-000000000000",
      }).then((response) => expect(response.status, "unknown uid").to.eq(404));
      // Well-formed but never created: organization ids are capped at 32
      // characters, so suffixing `organization_id` would be a malformed id (400).
      assign(`missing-${Math.random().toString(36).slice(2, 10)}`, {
        input_mode: "uid",
        identifier: target.uid,
      }).then((response) => expect(response.status, "unknown organization").to.eq(404));

      // Membership of the system organization follows the admin flag (403).
      assign(SYSTEM_ORGANIZATION_ID, {
        input_mode: "uid",
        identifier: target.uid,
      }).then((response) => {
        expect(response.status, "system organization").to.eq(403);
        expect(String(response.body.message).toLowerCase()).to.include("system");
      });

      // Service accounts never join organizations (400).
      cy.request({
        method: "POST",
        url: "/api/apps",
        body: {
          app_id,
          app_name: `Assignment service account ${app_id}`,
          app_description: "AdminDirectMemberAssignmentApi.cy.ts",
          created_at: Date.now(),
          public: true,
          hardcoded: false,
          web: false,
        },
      })
        .its("status")
        .should("eq", 200);
      cy.request<{ service_account?: { uid: string } }>({
        method: "POST",
        url: `/api/apps/${app_id}/service-account`,
      }).then((response) => {
        expect(response.status).to.eq(201);
        const service_account_uid = response.body.service_account?.uid;
        expect(service_account_uid).to.be.a("string");
        assign(organization_id, {
          input_mode: "uid",
          identifier: service_account_uid,
        }).then((assignResponse) => {
          expect(assignResponse.status, "service account").to.eq(400);
          expect(String(assignResponse.body.message).toLowerCase()).to.include(
            "service account",
          );
        });
      });

      // None of the refused requests added anyone.
      cy.request<MembersResponseBody>(
        `/api/organizations/${organization_id}/members`,
      ).then((response) => {
        const uids = (response.body.data?.members ?? []).map((m) => m.uid);
        expect(uids).to.not.include(target.uid);
        expect(uids).to.have.length(1);
      });

      cy.request({ method: "DELETE", url: `/api/apps/${app_id}`, failOnStatusCode: false });
      cy.delete_organization({ organization_id });
    });
  });
});
