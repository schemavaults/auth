// Pins the owner-only authorization boundary of
// DELETE /api/organizations/[organization_id]
// (auth-server/src/app/api/organizations/[organization_id]/operation.ts).
//
// The handler lets the request through only for a platform administrator or
// for a caller whose membership of the organization has the `owner` role:
//
//   const isGlobalAdmin = user.admin === true;
//   if (!isGlobalAdmin) {
//     const userMemberships = await registry.listUserOrganizationMemberships(...);
//     const userMembership = userMemberships.find(...);
//     if (!userMembership || userMembership.role !== "owner") { ... 403 ... }
//   }
//
// Existing specs cover the neighbouring cases but not this one:
//   - organizations/NonMemberOrganizationApiAccess.cy.ts -> 403 for a caller
//     with NO membership at all,
//   - organizations/SystemOrganizationProtection.cy.ts   -> 403 for hardcoded
//     (system) organizations,
//   - misc/UnauthenticatedApiRequests.cy.ts              -> 401 with no session.
//
// The gap was the *member* case: a legitimate, accepted member of the
// organization whose role is `member` rather than `owner`. That is the branch
// where `userMembership` is found but its role is wrong, so a regression that
// only checked for the presence of a membership (instead of its role) would
// let any member destroy their organization and every other member's access
// to it, while all of the specs above kept passing.
//
// Scope: only who may delete an organization. The owner-side delete is
// asserted purely as the positive control that proves the 403 came from the
// member's role and not from a broken fixture.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

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
}

interface CreateInvitationResponseBody {
  success: boolean;
  data?: { invitation: { invitation_id: string } };
}

interface MyOrganizationsResponseBody {
  success: boolean;
  data?: {
    memberships: readonly { organization_id: string; role: string }[];
  };
}

/** Registers a fresh regular user by request, reads their uid, logs out. */
function registerUser(): Cypress.Chainable<User> {
  return cy.generate_random_test_user_credentials().then((credentials) =>
    cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((ok: boolean) => {
        expect(ok, "regular user registration").to.be.true;
        return cy.request({
          method: "GET",
          url: `/api/auth/whoami/${AUTH_APP_ID}`,
        });
      })
      .then((whoami) => {
        const uid: string = whoami.body.user.uid;
        cy.logout_via_request();
        return cy.wrap<User>({ ...credentials, uid }, { log: false });
      }),
  );
}

function loginAs(user: User): void {
  cy.login_via_request(user.email, user.password).then(
    (ok: boolean) => expect(ok, `login as ${user.email}`).to.be.true,
  );
}

/**
 * Creates an organization owned by a fresh regular user, with a second fresh
 * regular user joined to it as a plain `member` through a real uid-mode
 * invitation they accept themselves. Leaves the session logged out.
 */
function setup(): Cypress.Chainable<Fixture> {
  return registerUser().then((owner) =>
    registerUser().then((member) =>
      cy.generate_random_code(10).then((code: string) => {
        const organization_id = `e2e-del-${code}`;
        loginAs(owner);
        cy.create_organization_via_request({
          organization_id,
          name: `Owner-only deletion org ${organization_id}`,
        });
        return cy
          .request<CreateInvitationResponseBody>({
            method: "POST",
            url: `/api/organizations/${organization_id}/invitations`,
            body: { input_mode: "uid", identifier: member.uid },
          })
          .then((invite) => {
            expect(invite.status, "invitation created").to.eq(201);
            const invitation_id = invite.body.data?.invitation.invitation_id;
            expect(invitation_id, "invitation_id").to.be.a("string");
            cy.logout_via_request();

            loginAs(member);
            cy.request({
              method: "PATCH",
              url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
              body: { action: "accept" },
            }).then((response) =>
              expect(response.status, "invitation accepted").to.eq(200),
            );
            cy.logout_via_request();

            return cy.wrap<Fixture>(
              { organization_id, owner, member },
              { log: false },
            );
          });
      }),
    ),
  );
}

function deleteOrganization(
  organization_id: string,
): Cypress.Chainable<Cypress.Response<{ success: boolean; message?: string }>> {
  return cy.request<{ success: boolean; message?: string }>({
    method: "DELETE",
    url: `/api/organizations/${organization_id}`,
    failOnStatusCode: false,
  });
}

/** The organization ids the current session is a member of. */
function myOrganizationIds(): Cypress.Chainable<readonly string[]> {
  return cy
    .request<MyOrganizationsResponseBody>({
      method: "GET",
      url: "/api/me/organizations",
    })
    .then((response) => {
      expect(response.status, "GET /api/me/organizations").to.eq(200);
      return cy.wrap<readonly string[]>(
        (response.body.data?.memberships ?? []).map(
          (membership) => membership.organization_id,
        ),
        { log: false },
      );
    });
}

describe("DELETE /api/organizations/:organization_id", () => {
  it("refuses a plain member of the organization with 403 and leaves the organization intact", () => {
    setup().then(({ organization_id, member }) => {
      loginAs(member);

      // The member really is a member of the organization: the refusal below
      // is about their role, not about a missing membership.
      myOrganizationIds().should("include", organization_id);

      deleteOrganization(organization_id).then((response) => {
        expect(
          response.status,
          "a member whose role is not 'owner' must not delete the organization",
        ).to.eq(403);
        expect(response.body).to.have.property("success", false);
        expect(
          String(response.body.message ?? "").toLowerCase(),
          "message should explain that only owners (or platform admins) may delete",
        ).to.include("owner");
      });

      // Nothing was destroyed: the membership — and therefore the
      // organization behind it — still exists.
      myOrganizationIds().should("include", organization_id);
      cy.logout_via_request();
    });
  });

  it("lets the organization's owner delete it", () => {
    setup().then(({ organization_id, owner }) => {
      loginAs(owner);

      deleteOrganization(organization_id).then((response) => {
        expect(response.status, "the owner may delete the organization").to.eq(
          200,
        );
        expect(response.body).to.have.property("success", true);
      });

      myOrganizationIds().should("not.include", organization_id);
      cy.logout_via_request();
    });
  });
});
