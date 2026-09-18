// Covers the `decline` action of
//   PATCH /api/organizations/[organization_id]/invitations/[invitation_id]
// (no spec exercised it) together with the request validation, not-found and
// state-transition branches of the respond and revoke endpoints:
//   - action other than accept/decline, malformed invitation id -> 400
//   - unknown invitation, invitation belonging to another org -> 404
//   - responding to / revoking an already-declined invitation -> 400
// Invitations are created by uid so no email lookup is involved.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface InvitationRecord {
  invitation_id: string;
  organization_id: string;
  invitee_uid: string;
  status: string;
  responded_at?: number | null;
}

interface CreateInvitationResponseBody {
  success: boolean;
  message?: string;
  data?: { invitation: InvitationRecord };
}

interface RespondToInvitationResponseBody {
  success: boolean;
  message?: string;
  data?: { invitation: InvitationRecord };
}

interface ListInvitationsResponseBody {
  success: boolean;
  data?: { invitations: InvitationRecord[] };
}

interface MembersResponseBody {
  success: boolean;
  data?: { members: Array<{ uid: string }> };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const UNKNOWN_INVITATION_ID = "00000000-0000-0000-0000-000000000099";

function randomOrgId(): string {
  return `e2e-decline-${Math.random().toString(36).slice(2, 10)}`;
}

interface Fixture {
  organization_id: string;
  invitation_id: string;
  invitee: { email: string; password: string; uid: string };
}

/**
 * Registers an invitee, then (as superuser) creates an organization and an
 * invitation for that invitee by uid. Leaves the session logged in as the
 * invitee.
 */
function setup(): Cypress.Chainable<Fixture> {
  const organization_id = randomOrgId();
  return cy.generate_random_test_user_credentials().then((credentials) => {
    return cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((ok: boolean) => {
        expect(ok, "invitee registration").to.be.true;
        return cy.request({
          method: "GET",
          url: `/api/auth/whoami/${AUTH_APP_ID}`,
        });
      })
      .then((whoami) => {
        const invitee_uid: string = whoami.body.user.uid;
        cy.logout();
        return cy
          .create_and_login_as_superuser_via_request()
          .then((ok: boolean) => {
            if (!ok) throw new Error("Failed to login as superuser");
            cy.create_organization_via_request({
              organization_id,
              name: `Decline org ${organization_id}`,
            });
            return cy.request<CreateInvitationResponseBody>({
              method: "POST",
              url: `/api/organizations/${organization_id}/invitations`,
              body: { input_mode: "uid", identifier: invitee_uid },
            });
          })
          .then((invite) => {
            expect(invite.status).to.eq(201);
            const invitation = invite.body.data?.invitation;
            if (!invitation) throw new Error("No invitation returned");
            expect(invitation.status).to.eq("pending");
            expect(invitation.invitee_uid).to.eq(invitee_uid);
            cy.logout();
            cy.login_via_request(credentials.email, credentials.password).then(
              (ok: boolean) => expect(ok, "invitee login").to.be.true,
            );
            return {
              organization_id,
              invitation_id: invitation.invitation_id,
              invitee: { ...credentials, uid: invitee_uid },
            };
          });
      });
  });
}

describe("Organization invitation decline API", () => {
  it("declines a pending invitation, hiding it from the invitee and leaving them a non-member", () => {
    setup().then(({ organization_id, invitation_id, invitee }) => {
      cy.request<RespondToInvitationResponseBody>({
        method: "PATCH",
        url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
        body: { action: "decline" },
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data?.invitation.status).to.eq("declined");
        expect(response.body.data?.invitation.responded_at).to.be.a("number");
      });

      cy.request<ListInvitationsResponseBody>({
        method: "GET",
        url: "/api/me/invitations",
      }).then((response) => {
        expect(response.status).to.eq(200);
        const pending = response.body.data?.invitations ?? [];
        expect(
          pending.some((i) => i.invitation_id === invitation_id),
          "declined invitation is no longer pending for the invitee",
        ).to.eq(false);
      });

      // Declined means the invitee did not join and cannot accept later.
      cy.request<RespondToInvitationResponseBody>({
        method: "PATCH",
        url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
        body: { action: "accept" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "accept after decline").to.eq(400);
        expect(response.body.success).to.eq(false);
      });
      cy.request({
        method: "GET",
        url: `/api/me/organizations/${organization_id}/role`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "invitee is not a member").to.eq(404);
      });
      cy.logout();

      // The owner sees the declined status and cannot revoke it any more.
      cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
        if (!ok) throw new Error("Failed to login as superuser");
        cy.request<ListInvitationsResponseBody>({
          method: "GET",
          url: `/api/organizations/${organization_id}/invitations`,
        }).then((response) => {
          expect(response.status).to.eq(200);
          const declined = response.body.data?.invitations.find(
            (i) => i.invitation_id === invitation_id,
          );
          expect(declined?.status).to.eq("declined");
        });
        cy.request<MembersResponseBody>({
          method: "GET",
          url: `/api/organizations/${organization_id}/members`,
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(JSON.stringify(response.body)).to.not.include(invitee.uid);
        });
        cy.request({
          method: "DELETE",
          url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "revoke a declined invitation").to.eq(400);
        });
        cy.delete_organization({ organization_id });
      });
    });
  });

  it("validates the respond request and scopes lookups to the organization", () => {
    setup().then(({ organization_id, invitation_id }) => {
      cy.request({
        method: "PATCH",
        url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
        body: { action: "revoke" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "unsupported action").to.eq(400);
      });
      cy.request({
        method: "PATCH",
        url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
        body: {},
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "missing action").to.eq(400);
      });
      cy.request({
        method: "PATCH",
        url: `/api/organizations/${organization_id}/invitations/not-a-uuid`,
        body: { action: "accept" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "malformed invitation id").to.eq(400);
      });
      cy.request({
        method: "PATCH",
        url: `/api/organizations/!!/invitations/${invitation_id}`,
        body: { action: "accept" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "malformed organization id").to.eq(400);
      });
      cy.request({
        method: "PATCH",
        url: `/api/organizations/${organization_id}/invitations/${UNKNOWN_INVITATION_ID}`,
        body: { action: "accept" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "unknown invitation").to.eq(404);
      });
      // The invitation exists, but not under this organization id.
      cy.request({
        method: "PATCH",
        url: `/api/organizations/e2e-some-other-org/invitations/${invitation_id}`,
        body: { action: "accept" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "invitation under another org").to.eq(404);
      });
      cy.logout();

      cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
        if (!ok) throw new Error("Failed to login as superuser");
        cy.request({
          method: "DELETE",
          url: `/api/organizations/${organization_id}/invitations/not-a-uuid`,
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "revoke malformed id").to.eq(400);
        });
        cy.request({
          method: "DELETE",
          url: `/api/organizations/${organization_id}/invitations/${UNKNOWN_INVITATION_ID}`,
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "revoke unknown invitation").to.eq(404);
        });
        cy.request({
          method: "DELETE",
          url: `/api/organizations/e2e-some-other-org/invitations/${invitation_id}`,
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "revoke under another org").to.eq(404);
        });
        cy.delete_organization({ organization_id });
      });
    });
  });
});
