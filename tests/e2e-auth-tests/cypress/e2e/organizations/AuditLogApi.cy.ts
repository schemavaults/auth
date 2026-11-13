// Audit logs (migration 00054):
//   GET /api/me/audit-log
//   GET /api/organizations/[organization_id]/audit-log
// Pins
//   - that an organization's log records its creation, an invitation being
//     sent and accepted and a role change, newest first, with who did it and
//     who it was about,
//   - who may read it: owners and platform administrators; members, outsiders
//     and signed-out callers are refused,
//   - that the same events appear in the log of each user they name, and
//     that the address and User-Agent of a request are only returned to the
//     user who made it (never in the organization's log),
//   - pagination by cursor, the event_type filter, and the 400 for a bad
//     cursor or limit,
//   - that an organization created with the id of a deleted one does not see
//     its predecessor's events.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface User {
  email: string;
  password: string;
  uid: string;
}

interface AuditLogEntry {
  audit_event_id: string;
  created_at: number;
  event_type: string;
  actor: { uid: string | null; email: string | null } | null;
  subject: { uid: string | null; email: string | null } | null;
  organization_id: string | null;
  client_app_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown> | null;
}

interface AuditLogResponseBody {
  success: boolean;
  message?: string;
  data?: { entries: AuditLogEntry[]; next_cursor: string | null };
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

/** Registers a fresh regular user via request and logs them out again. */
function registerUser(): Cypress.Chainable<User> {
  return registerAndStaySignedIn().then((user) => {
    cy.logout();
    return cy.wrap<User>(user, { log: false });
  });
}

function loginAs(user: User): void {
  cy.login_via_request(user.email, user.password).then((ok: boolean) =>
    expect(ok, `login as ${user.email}`).to.be.true,
  );
}

function randomOrganizationId(): string {
  return `e2e-audit-${Math.random().toString(36).slice(2, 10)}`;
}

function auditLog(url: string): Cypress.Chainable<Cypress.Response<AuditLogResponseBody>> {
  return cy.request<AuditLogResponseBody>({ url, failOnStatusCode: false });
}

function organizationAuditLog(
  organization_id: string,
  query: string = "",
): Cypress.Chainable<Cypress.Response<AuditLogResponseBody>> {
  return auditLog(`/api/organizations/${organization_id}/audit-log${query}`);
}

function entriesOf(response: Cypress.Response<AuditLogResponseBody>): AuditLogEntry[] {
  expect(response.status).to.eq(200);
  expect(response.body.success).to.eq(true);
  return response.body.data?.entries ?? [];
}

describe("Audit log API", () => {
  it("records an organization's events for its owners and for the users they name", () => {
    const organization_id = randomOrganizationId();
    registerUser().then((member) => {
      registerUser().then((outsider) => {
        registerAndStaySignedIn().then((owner) => {
          cy.create_organization_via_request({ organization_id, name: `Audit ${organization_id}` });
          cy.request<{ data: { invitation: { invitation_id: string } } }>({
            method: "POST",
            url: `/api/organizations/${organization_id}/invitations`,
            body: { input_mode: "email", identifier: member.email },
          }).then((invited) => {
            expect(invited.status).to.eq(201);
            const invitation_id: string = invited.body.data.invitation.invitation_id;

            // The invitee accepts; as a plain member they may not read the log.
            cy.logout();
            loginAs(member);
            cy.request({
              method: "PATCH",
              url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
              body: { action: "accept" },
            }).then((accepted) => expect(accepted.status).to.eq(200));
            organizationAuditLog(organization_id).then((response) => {
              expect(response.status, "member").to.eq(403);
            });

            // The member's own log names the owner, without the owner's address.
            auditLog("/api/me/audit-log").then((response) => {
              const entries = entriesOf(response);
              const sent = entries.find((e) => e.event_type === "organization.invitation_sent");
              expect(sent, "invitation_sent in the invitee's log").to.not.eq(undefined);
              expect(sent?.actor).to.deep.eq({ uid: owner.uid, email: owner.email });
              expect(sent?.subject).to.deep.eq({ uid: member.uid, email: member.email });
              expect(sent?.organization_id).to.eq(organization_id);
              expect(sent?.ip_address, "another user's address").to.eq(null);
              expect(sent?.user_agent, "another user's User-Agent").to.eq(null);

              const accepted = entries.find((e) => e.event_type === "organization.invitation_accepted");
              expect(accepted?.actor?.uid).to.eq(member.uid);
              expect(accepted?.ip_address, "the caller's own address").to.be.a("string");

              const registered = entries.find((e) => e.event_type === "user.registered");
              expect(registered?.subject?.uid).to.eq(member.uid);
              expect(entries.some((e) => e.event_type === "user.signed_in"), "signed_in").to.eq(true);
              // Newest first
              const times = entries.map((e) => e.created_at);
              expect(times).to.deep.eq([...times].sort((a, b) => b - a));
            });

            cy.logout();
            loginAs(outsider);
            organizationAuditLog(organization_id).then((response) => {
              expect(response.status, "outsider").to.eq(403);
            });
            // No user reads another user's log through their own.
            auditLog("/api/me/audit-log").then((response) => {
              for (const entry of entriesOf(response)) {
                expect([entry.actor?.uid, entry.subject?.uid]).to.include(outsider.uid);
              }
            });

            cy.logout();
            organizationAuditLog(organization_id).then((response) => {
              expect(response.status, "signed out").to.eq(401);
            });
            auditLog("/api/me/audit-log").then((response) => {
              expect(response.status, "signed out").to.eq(401);
            });

            // The owner promotes the member and reads the whole log.
            loginAs(owner);
            cy.request({
              method: "PATCH",
              url: `/api/organizations/${organization_id}/members/${member.uid}/role`,
              body: { role: "owner" },
            }).then((changed) => expect(changed.status).to.eq(200));

            organizationAuditLog(organization_id).then((response) => {
              const entries = entriesOf(response);
              expect(entries.map((e) => e.event_type)).to.deep.eq([
                "organization.member_role_changed",
                "organization.invitation_accepted",
                "organization.invitation_sent",
                "organization.created",
              ]);
              expect(response.body.data?.next_cursor).to.eq(null);
              for (const entry of entries) {
                expect(entry.organization_id).to.eq(organization_id);
                expect(entry.ip_address, "organization logs carry no address").to.eq(null);
                expect(entry.user_agent, "organization logs carry no User-Agent").to.eq(null);
              }
              const [role_changed, accepted, , created] = entries;
              expect(role_changed?.actor?.email).to.eq(owner.email);
              expect(role_changed?.subject?.email).to.eq(member.email);
              expect(role_changed?.details).to.deep.eq({ role: "owner" });
              expect(accepted?.actor?.email).to.eq(member.email);
              expect(accepted?.details).to.deep.eq({ invitation_id });
              expect(created?.actor?.uid).to.eq(owner.uid);
              expect(created?.subject).to.eq(null);
            });

            // Pagination, filter and validation
            organizationAuditLog(organization_id, "?limit=3").then((first) => {
              const first_entries = entriesOf(first);
              expect(first_entries).to.have.length(3);
              const cursor = first.body.data?.next_cursor;
              expect(cursor).to.be.a("string");
              organizationAuditLog(
                organization_id,
                `?limit=3&cursor=${encodeURIComponent(cursor ?? "")}`,
              ).then((second) => {
                expect(entriesOf(second).map((e) => e.event_type)).to.deep.eq(["organization.created"]);
                expect(second.body.data?.next_cursor).to.eq(null);
              });
            });
            organizationAuditLog(organization_id, "?event_type=organization.invitation_sent").then((response) => {
              expect(entriesOf(response).map((e) => e.event_type)).to.deep.eq(["organization.invitation_sent"]);
            });
            for (const query of ["?cursor=nope", "?limit=0", "?limit=101", "?event_type=organization.nope"]) {
              organizationAuditLog(organization_id, query).then((response) => {
                expect(response.status, query).to.eq(400);
              });
            }

            // The promoted member is an owner now, and may read the log.
            cy.logout();
            loginAs(member);
            organizationAuditLog(organization_id).then((response) => {
              expect(entriesOf(response)).to.have.length(4);
            });
          });
        });
      });
    });
  });

  it("does not show a deleted organization's events to a new organization of the same id", () => {
    const organization_id = randomOrganizationId();
    registerAndStaySignedIn().then((owner) => {
      cy.create_organization_via_request({ organization_id, name: "First" });
      organizationAuditLog(organization_id).then((response) => {
        expect(entriesOf(response).map((e) => e.event_type)).to.deep.eq(["organization.created"]);
      });
      cy.request({ method: "DELETE", url: `/api/organizations/${organization_id}` }).then((deleted) => {
        expect(deleted.status).to.eq(200);
      });
      // No longer an owner of anything by that id.
      organizationAuditLog(organization_id).then((response) => {
        expect(response.status).to.eq(403);
      });

      cy.create_organization_via_request({ organization_id, name: "Second" });
      organizationAuditLog(organization_id).then((response) => {
        const entries = entriesOf(response);
        expect(entries.map((e) => e.event_type)).to.deep.eq(["organization.created"]);
        expect(entries[0]?.details).to.deep.eq({ name: "Second" });
      });

      // The owner's own log keeps the history, detached from the organization.
      auditLog("/api/me/audit-log?event_type=organization.created").then((response) => {
        const entries = entriesOf(response);
        expect(entries).to.have.length(2);
        expect(entries[0]?.organization_id).to.eq(organization_id);
        expect(entries[1]?.organization_id).to.eq(null);
        expect(entries[1]?.details).to.deep.eq({ name: "First", organization_id });
      });
      auditLog("/api/me/audit-log?event_type=organization.deleted").then((response) => {
        const entries = entriesOf(response);
        expect(entries).to.have.length(1);
        expect(entries[0]?.actor?.uid).to.eq(owner.uid);
        expect(entries[0]?.details).to.deep.eq({ organization_id });
      });
    });
  });
});
