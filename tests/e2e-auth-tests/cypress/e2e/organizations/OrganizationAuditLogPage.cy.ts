// The organization audit log PAGE: /orgs/[organization_id]/audit-log
//
// organizations/AuditLogApi.cy.ts pins the endpoint behind it
// (GET /api/organizations/[organization_id]/audit-log). This spec pins the
// page, whose server component repeats the endpoint's "organization owners
// and platform administrators" rule by hand
// (auth-server/src/app/(client)/(authenticated)/orgs/[organization_id]/audit-log/page.tsx),
// and the organization page's link card, which is rendered on the same rule
// (`canViewAuditLog` in orgs/[organization_id]/page.tsx).
//
// Fixture (built once, by request): an owner creates an organization and
// invites a second user, who accepts and so holds the `member` role.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface TestUser {
  email: string;
  password: string;
  uid: string;
}

interface Fixture {
  organization_id: string;
  organization_name: string;
  owner: TestUser;
  member: TestUser;
}

interface InvitationResponseBody {
  data: { invitation: { invitation_id: string } };
}

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

let f: Fixture;

/** The signed-in user's uid. */
function currentUid(): Cypress.Chainable<string> {
  return cy
    .request<{ user: { uid: string } }>(`/api/auth/whoami/${AUTH_APP_ID}`)
    .then((response) => response.body.user.uid);
}

/** Registers a fresh regular user by request; they stay signed in. */
function registerAndStaySignedIn(): Cypress.Chainable<TestUser> {
  return cy.generate_random_test_user_credentials().then((credentials) =>
    cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((ok: boolean) => {
        expect(ok, "registration").to.be.true;
        return currentUid();
      })
      .then((uid: string) => cy.wrap<TestUser>({ ...credentials, uid }, { log: false })),
  );
}

function loginAs(user: TestUser): void {
  cy.login_via_request(user.email, user.password).then((ok: boolean) =>
    expect(ok, `login as ${user.email}`).to.be.true,
  );
}

describe("Organization audit log page", () => {
  before(() => {
    const organization_id = `e2e-auditpage-${Math.random().toString(36).slice(2, 10)}`;
    const organization_name = `Audit page ${organization_id}`;

    registerAndStaySignedIn().then((member: TestUser) => {
      cy.logout_via_request();
      registerAndStaySignedIn().then((owner: TestUser) => {
        cy.create_organization_via_request({ organization_id, name: organization_name });
        cy.request<InvitationResponseBody>({
          method: "POST",
          url: `/api/organizations/${organization_id}/invitations`,
          body: { input_mode: "email", identifier: member.email },
        }).then((invited) => {
          expect(invited.status, "invitation created").to.eq(201);
          const invitation_id: string = invited.body.data.invitation.invitation_id;

          cy.logout_via_request();
          loginAs(member);
          cy.request({
            method: "PATCH",
            url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
            body: { action: "accept" },
          }).then((accepted) => expect(accepted.status, "invitation accepted").to.eq(200));
          cy.logout_via_request();
          cy.clearCookies();

          f = { organization_id, organization_name, owner, member };
        });
      });
    });
  });

  it("lists the organization's events for an owner who follows the link from the organization page", () => {
    loginAs(f.owner);
    cy.visit(`/orgs/${f.organization_id}`);
    cy.wait_for_page_hydration();
    cy.get('[data-testid="view-organization-audit-log-link"]').should("be.visible").click();
    cy.location("pathname").should("eq", `/orgs/${f.organization_id}/audit-log`);

    cy.get('[data-testid="audit-log-card"]').should("be.visible").and("contain.text", f.organization_name);

    // Exactly the three events the fixture produced, newest first.
    cy.get('[data-testid="audit-log-entry"]').should("have.length", 3);
    cy.get('[data-testid="audit-log-entry"]')
      .then(($entries) => Cypress._.map($entries.toArray(), (el) => el.getAttribute("data-event-type")))
      .should("deep.equal", [
        "organization.invitation_accepted",
        "organization.invitation_sent",
        "organization.created",
      ]);

    // Who did what, written for the owner reading it.
    cy.get('[data-testid="audit-log-entry"][data-event-type="organization.invitation_sent"]')
      .find('[data-testid="audit-log-entry-description"]')
      .should("contain.text", "You invited")
      .and("contain.text", f.member.email);
    cy.get('[data-testid="audit-log-entry"][data-event-type="organization.invitation_accepted"]')
      .find('[data-testid="audit-log-entry-description"]')
      .should("contain.text", f.member.email)
      .and("contain.text", "joined the organization");

    // Back to the organization the log belongs to.
    cy.get('[data-testid="organization-audit-log-back-link"]').click();
    cy.location("pathname").should("eq", `/orgs/${f.organization_id}`);
  });

  it("is neither linked nor served to a plain member of the organization", () => {
    loginAs(f.member);

    // The member may read the organization page, but is not offered the log.
    cy.visit(`/orgs/${f.organization_id}`);
    cy.wait_for_page_hydration();
    cy.location("pathname").should("eq", `/orgs/${f.organization_id}`);
    cy.get('[data-testid="view-organization-audit-log-link"]').should("not.exist");

    // Nor served the page when they ask for it by URL.
    cy.visit(`/orgs/${f.organization_id}/audit-log`, { failOnStatusCode: false });
    cy.location("pathname").should("eq", "/error");
    cy.location("search").should("contain", "error=403").and("contain", "error_id=forbidden");
    cy.get('[data-testid="audit-log-card"]').should("not.exist");
  });
});
