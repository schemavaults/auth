// The organization audit log page (/orgs/[organization_id]/audit-log).
//
// GET /api/organizations/[organization_id]/audit-log is pinned by
// AuditLogApi.cy.ts; this spec pins the *page* that renders it:
//   - an owner reaches it from the organization page's "View audit log"
//     card and sees the organization's recorded events, newest first,
//   - a plain member is neither offered the link nor allowed to open the
//     page directly (the page's own route guard, 403 forbidden).

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface User {
  email: string;
  password: string;
  uid: string;
}

interface Organization {
  organization_id: string;
  owner: User;
  member: User;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

/** The signed-in user's uid. */
function currentUid(): Cypress.Chainable<string> {
  return cy
    .request<{ user: { uid: string } }>(`/api/auth/whoami/${AUTH_APP_ID}`)
    .then((response) => response.body.user.uid);
}

/** Registers a fresh regular user via request; they stay signed in. */
function registerAndStaySignedIn(): Cypress.Chainable<User> {
  return cy.generate_random_test_user_credentials().then((credentials) =>
    cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((ok: boolean) => {
        expect(ok, "registration").to.be.true;
        return currentUid();
      })
      .then((uid: string) => cy.wrap<User>({ ...credentials, uid }, { log: false })),
  );
}

function loginAs(user: User): void {
  cy.login_via_request(user.email, user.password).then((ok: boolean) =>
    expect(ok, `login as ${user.email}`).to.be.true,
  );
}

/**
 * Creates an organization owned by a fresh user, with a second fresh user
 * joined to it as a plain member (through an invitation they accept).
 * Nobody is signed in when the chain resolves.
 */
function organizationWithOwnerAndMember(): Cypress.Chainable<Organization> {
  const organization_id: string = `e2e-audit-page-${Math.random().toString(36).slice(2, 10)}`;

  return registerAndStaySignedIn().then((member: User) => {
    cy.logout();
    return registerAndStaySignedIn().then((owner: User) => {
      cy.create_organization_via_request({
        organization_id,
        name: `Audit page ${organization_id}`,
      });
      return cy
        .request<{ data: { invitation: { invitation_id: string } } }>({
          method: "POST",
          url: `/api/organizations/${organization_id}/invitations`,
          body: { input_mode: "email", identifier: member.email },
        })
        .then((invited) => {
          expect(invited.status, "invitation created").to.eq(201);
          const invitation_id: string = invited.body.data.invitation.invitation_id;

          cy.logout();
          loginAs(member);
          cy.request({
            method: "PATCH",
            url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
            body: { action: "accept" },
          }).then((accepted) => expect(accepted.status, "invitation accepted").to.eq(200));
          cy.logout();

          return cy.wrap<Organization>({ organization_id, owner, member }, { log: false });
        });
    });
  });
}

describe("Organization audit log page", () => {
  it("shows an owner the organization's recorded events", () => {
    organizationWithOwnerAndMember().then(({ organization_id, owner, member }) => {
      loginAs(owner);

      cy.visit(`/orgs/${organization_id}`);
      cy.get('[data-testid="view-organization-audit-log-link"]').click();
      cy.location("pathname").should("eq", `/orgs/${organization_id}/audit-log`);

      cy.get('[data-testid="audit-log-card"]').should("be.visible");
      // organization.created, invitation_sent and invitation_accepted
      cy.get('[data-testid="audit-log-entry"]').should("have.length", 3);

      // Newest first: the member accepted the invitation last.
      cy.get('[data-testid="audit-log-entry"]')
        .first()
        .should("have.attr", "data-event-type", "organization.invitation_accepted")
        .find('[data-testid="audit-log-entry-description"]')
        .should("contain.text", member.email)
        .and("contain.text", "joined the organization");

      // The owner created it, and reads their own action as "You".
      cy.get('[data-testid="audit-log-entry"][data-event-type="organization.created"]')
        .should("have.length", 1)
        .find('[data-testid="audit-log-entry-description"]')
        .should("contain.text", "You created the organization");

      cy.get('[data-testid="audit-log-entry"][data-event-type="organization.invitation_sent"]')
        .should("have.length", 1)
        .find('[data-testid="audit-log-entry-description"]')
        .should("contain.text", member.email);

      // An organization's log never carries the address of a request.
      cy.get('[data-testid="audit-log-entry-request"]').should("not.exist");

      // Back to the organization it belongs to.
      cy.get('[data-testid="organization-audit-log-back-link"]').click();
      cy.location("pathname").should("eq", `/orgs/${organization_id}`);
    });
  });

  it("refuses a plain member of the organization", () => {
    organizationWithOwnerAndMember().then(({ organization_id, member }) => {
      loginAs(member);

      // The member may open the organization page, but is not offered the log.
      cy.visit(`/orgs/${organization_id}`);
      cy.wait_for_page_hydration();
      // Wait for the page itself before asserting the card is absent.
      cy.contains(`Audit page ${organization_id}`).should("be.visible");
      cy.get('[data-testid="view-organization-audit-log-link"]').should("not.exist");

      // Nor may they open the page directly.
      cy.visit(`/orgs/${organization_id}/audit-log`, { failOnStatusCode: false });
      cy.url().should("include", "/error");
      cy.url().should("include", "error=403");
      cy.url().should("include", "error_id=forbidden");
      cy.get('[data-testid="audit-log-card"]').should("not.exist");
    });
  });
});
