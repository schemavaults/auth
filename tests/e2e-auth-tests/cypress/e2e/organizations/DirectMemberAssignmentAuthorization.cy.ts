// Gates POST /api/organizations/[organization_id]/members, the platform
// administrators' direct member assignment (no invitation to accept), to
// platform administrators only. Every other caller must be refused before
// anything is written:
//   - unauthenticated callers get 401,
//   - a regular user outside the organization gets 403, whether they try to
//     add themselves (by uid or e-mail) or someone else,
//   - a plain member gets 403, including when trying to re-add themselves
//     as `owner` (privilege escalation),
//   - the organization's OWNER gets 403 as well: owners must invite, the
//     invitation bypass is for administrators only,
//   - a bearer access token of a regular user gets 403 (the admin guard
//     applies to every accepted credential, not just the session cookie),
//   - a non-admin's malformed body is still a 403, never a 400 (the admin
//     guard runs before request validation, so non-admins learn nothing
//     about the request shape).
// After all attempts the organization still holds exactly its owner and
// its invited member, with unchanged roles, and nobody gained a membership.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

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
  target: User;
}

interface MembersResponseBody {
  success: boolean;
  data?: { members: Array<{ uid: string; role: string }> };
}

interface MyOrganizationsResponseBody {
  success: boolean;
  data?: { memberships: Array<{ organization_id: string; role: string }> };
}

interface CreateInvitationResponseBody {
  success: boolean;
  data?: { invitation: { invitation_id: string } };
}

interface TokenResponseBody {
  access_token?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

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

/**
 * An organization created by a regular user (its owner) with a second
 * user who joined through an accepted invitation, plus two users outside
 * it. Leaves the session logged out.
 */
function setup(): Cypress.Chainable<Fixture> {
  const organization_id = `e2e-assign-${Math.random().toString(36).slice(2, 10)}`;
  return registerUser().then((owner) =>
    registerUser().then((member) =>
      registerUser().then((outsider) =>
        registerUser().then((target) => {
          loginAs(owner);
          cy.create_organization_via_request({
            organization_id,
            name: `Direct assignment gate ${organization_id}`,
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
                { organization_id, owner, member, outsider, target },
                { log: false },
              );
            });
        }),
      ),
    ),
  );
}

function assign(
  organization_id: string,
  body: Cypress.RequestBody,
  headers: Record<string, string> = {},
): Cypress.Chainable<Cypress.Response<{ success?: boolean; message?: string }>> {
  return cy.request({
    method: "POST",
    url: `/api/organizations/${organization_id}/members`,
    body,
    headers,
    failOnStatusCode: false,
  });
}

function expectForbidden(
  response: Cypress.Response<{ success?: boolean }>,
  label: string,
): void {
  expect(response.status, label).to.eq(403);
  expect(response.body.success, `${label} success`).to.eq(false);
}

/** The organizations the signed-in user belongs to. */
function myOrganizationIds(): Cypress.Chainable<string[]> {
  return cy
    .request<MyOrganizationsResponseBody>({ method: "GET", url: "/api/me/organizations" })
    .then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.data?.memberships).to.be.an("array");
      return (response.body.data?.memberships ?? []).map(
        (m) => m.organization_id,
      );
    });
}

/** Redeems the session's refresh cookie for an auth-server-audience access token. */
function mintAccessToken(): Cypress.Chainable<string> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: AUTH_APP_ID,
    resource: Cypress.env("AUTH_SERVER_URL"),
    refresh_token_delivery: "http_only_cookie",
  });
  return cy
    .request<TokenResponseBody>({
      method: "POST",
      url: "/api/oidc/token",
      body: form.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Origin: new URL(Cypress.config("baseUrl")!).origin,
      },
    })
    .then((response) => {
      expect(response.status, "token endpoint status").to.eq(200);
      expect(response.body.access_token).to.be.a("string").and.not.be.empty;
      return response.body.access_token as string;
    });
}

describe("Direct organization member assignment is admin-only", () => {
  it("rejects unauthenticated callers with 401", () => {
    setup().then(({ organization_id, target }) => {
      assign(organization_id, {
        input_mode: "uid",
        identifier: target.uid,
        role: "owner",
      }).then((response) => {
        expect(response.status).to.eq(401);
        expect(response.body.success).to.eq(false);
      });

      cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
        if (!ok) throw new Error("Failed to login as superuser");
        cy.request<MembersResponseBody>(
          `/api/organizations/${organization_id}/members`,
        ).then((response) => {
          const uids = (response.body.data?.members ?? []).map((m) => m.uid);
          expect(uids).to.not.include(target.uid);
        });
        cy.delete_organization({ organization_id });
      });
    });
  });

  it("refuses outsiders, members and even the organization's owner (403), with no side effects", () => {
    setup().then(({ organization_id, owner, member, outsider, target }) => {
      // An outsider adding themselves, by uid and by e-mail, or someone else.
      loginAs(outsider);
      assign(organization_id, {
        input_mode: "uid",
        identifier: outsider.uid,
        role: "member",
      }).then((response) => expectForbidden(response, "outsider adds self by uid"));
      assign(organization_id, {
        input_mode: "email",
        identifier: outsider.email,
        role: "owner",
      }).then((response) => expectForbidden(response, "outsider adds self by e-mail"));
      assign(organization_id, {
        input_mode: "uid",
        identifier: target.uid,
      }).then((response) => expectForbidden(response, "outsider adds another user"));
      // 403 beats 400: the admin guard runs before request validation.
      assign(organization_id, { input_mode: "nonsense" }).then((response) =>
        expectForbidden(response, "outsider with a malformed body"),
      );
      myOrganizationIds().then((ids) =>
        expect(ids, "outsider memberships").to.not.include(organization_id),
      );
      cy.logout();

      // A plain member escalating to owner, or adding someone else.
      loginAs(member);
      assign(organization_id, {
        input_mode: "uid",
        identifier: member.uid,
        role: "owner",
      }).then((response) => expectForbidden(response, "member re-adds self as owner"));
      assign(organization_id, {
        input_mode: "email",
        identifier: target.email,
        role: "member",
      }).then((response) => expectForbidden(response, "member adds another user"));
      cy.request(
        `/api/organizations/${organization_id}/members/${member.uid}/role`,
      ).then((response) => {
        expect(response.body.data?.role, "member's role is unchanged").to.eq("member");
      });
      cy.logout();

      // The owner must go through invitations like everyone else.
      loginAs(owner);
      assign(organization_id, {
        input_mode: "uid",
        identifier: target.uid,
        role: "member",
      }).then((response) => expectForbidden(response, "owner adds a user by uid"));
      assign(organization_id, {
        input_mode: "email",
        identifier: target.email,
        role: "owner",
      }).then((response) => expectForbidden(response, "owner adds a user by e-mail"));
      assign(organization_id, {
        input_mode: "email",
        identifier: outsider.email,
      }).then((response) => expectForbidden(response, "owner adds an outsider"));
      assign(organization_id, {}).then((response) =>
        expectForbidden(response, "owner with an empty body"),
      );
      // Nor can the owner assign into an organization they do not belong to.
      assign("some-other-org", {
        input_mode: "uid",
        identifier: target.uid,
      }).then((response) => expectForbidden(response, "owner targets another org"));
      cy.logout();

      // The target (who has no relationship with the org) cannot add themselves either.
      loginAs(target);
      assign(organization_id, {
        input_mode: "uid",
        identifier: target.uid,
        role: "owner",
      }).then((response) => expectForbidden(response, "target adds self"));
      myOrganizationIds().then((ids) =>
        expect(ids, "target memberships").to.not.include(organization_id),
      );
      cy.logout();

      // Nothing changed: still exactly the owner and the invited member.
      cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
        if (!ok) throw new Error("Failed to login as superuser");
        cy.request<MembersResponseBody>(
          `/api/organizations/${organization_id}/members`,
        ).then((response) => {
          expect(response.status).to.eq(200);
          const roles = Object.fromEntries(
            (response.body.data?.members ?? []).map((m) => [m.uid, m.role]),
          );
          expect(roles).to.deep.eq({ [owner.uid]: "owner", [member.uid]: "member" });
        });
        cy.delete_organization({ organization_id });
      });
    });
  });

  it("refuses a regular user's bearer access token (403)", () => {
    setup().then(({ organization_id, owner, target }) => {
      loginAs(owner);
      mintAccessToken().then((access_token) => {
        // Drop the session cookie so only the bearer token authenticates.
        cy.clearCookies();
        assign(
          organization_id,
          { input_mode: "uid", identifier: target.uid, role: "owner" },
          { Authorization: `Bearer ${access_token}` },
        ).then((response) => expectForbidden(response, "owner's bearer token"));
      });

      cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
        if (!ok) throw new Error("Failed to login as superuser");
        cy.request<MembersResponseBody>(
          `/api/organizations/${organization_id}/members`,
        ).then((response) => {
          const uids = (response.body.data?.members ?? []).map((m) => m.uid);
          expect(uids).to.not.include(target.uid);
        });
        cy.delete_organization({ organization_id });
      });
    });
  });

  it("does not show the Add Member button to the organization's owner", () => {
    setup().then(({ organization_id, owner }) => {
      loginAs(owner);
      cy.visit(`/orgs/${organization_id}`);
      cy.wait_for_page_hydration();
      // Owners invite...
      cy.get("button#open-invite-member-dialog-button").should("be.visible");
      // ...but never assign directly.
      cy.get("button#open-assign-organization-member-dialog-button").should(
        "not.exist",
      );
      cy.logout();

      cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
        if (!ok) throw new Error("Failed to login as superuser");
        cy.delete_organization({ organization_id });
      });
    });
  });
});
