// Organization MFA requirements (migration 00048):
//   GET|PUT /api/organizations/[organization_id]/mfa-requirement
//   GET     /api/me/organization-mfa-requirements
//   GET|POST /api/admin/organizations/enforce-mfa-requirements
// Pins
//   - who may read (members, platform admins) and change (owners, platform
//     admins) the requirement, the grace period bounds, the system
//     organization refusal, and that an owner without MFA cannot turn it on
//     (409 `mfa_required`),
//   - that turning it on starts a grace period for each member without MFA,
//     and joining is refused to users without MFA (direct assignment 409,
//     invitation acceptance 403, both `error: mfa_required`),
//   - that a member whose grace period ended no longer counts as a member and
//     the enforcement job removes them,
//   - that removing one's last factor starts a new grace period and turning
//     the requirement off ends it.
// Users that got MFA (through the test enrollment seed, which keeps the
// current session) are never signed in again: their steps run in that
// session, since login_via_request cannot answer an MFA challenge.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();
const SYSTEM_ORGANIZATION_ID = "schemavaults";
const DAY_MS = 24 * 60 * 60 * 1000;

interface User {
  email: string;
  password: string;
  uid: string;
}

interface MemberWithoutMfa {
  uid: string;
  email: string;
  role: string;
  status: "pending" | "grace_period" | "expired";
  grace_period_reason: "requirement_enabled" | "mfa_removed" | null;
  grace_period_ends_at: number | null;
}

interface RequirementResponseBody {
  success: boolean;
  message: string;
  error?: string;
  data?: {
    requirement: {
      organization_id: string;
      required: boolean;
      grace_period_days: number | null;
      required_since: number | null;
      caller_has_mfa: boolean;
      members_without_mfa: MemberWithoutMfa[] | null;
    };
  };
}

interface MyRequirementsResponseBody {
  success: boolean;
  data?: {
    mfa_enabled: boolean;
    organizations: Array<{
      organization_id: string;
      status: "compliant" | "pending" | "grace_period" | "expired";
      grace_period_reason: string | null;
      grace_period_ends_at: number | null;
    }>;
  };
}

interface EnforcementResponseBody {
  success: boolean;
  data?: { removed_members: Array<{ organization_id: string; uid: string }> };
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

function loginAsSuperuser(): void {
  cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
    if (!ok) throw new Error("Failed to login as superuser");
  });
}

function randomOrganizationId(): string {
  return `e2e-org-mfa-${Math.random().toString(36).slice(2, 10)}`;
}

function createOrganization(organization_id: string): void {
  cy.create_organization_via_request({
    organization_id,
    name: `Org MFA ${organization_id}`,
  });
}

function putRequirement(
  organization_id: string,
  body: Cypress.RequestBody,
): Cypress.Chainable<Cypress.Response<RequirementResponseBody>> {
  return cy.request<RequirementResponseBody>({
    method: "PUT",
    url: `/api/organizations/${organization_id}/mfa-requirement`,
    body,
    failOnStatusCode: false,
  });
}

function getRequirement(
  organization_id: string,
): Cypress.Chainable<Cypress.Response<RequirementResponseBody>> {
  return cy.request<RequirementResponseBody>({
    url: `/api/organizations/${organization_id}/mfa-requirement`,
    failOnStatusCode: false,
  });
}

function myRequirements(): Cypress.Chainable<MyRequirementsResponseBody> {
  return cy
    .request<MyRequirementsResponseBody>("/api/me/organization-mfa-requirements")
    .then((response) => {
      expect(response.status).to.eq(200);
      return response.body;
    });
}

function myOrganizationIds(): Cypress.Chainable<string[]> {
  return cy
    .request<{ data?: { memberships: Array<{ organization_id: string }> } }>("/api/me/organizations")
    .then((response) => {
      expect(response.status).to.eq(200);
      return (response.body.data?.memberships ?? []).map((m) => m.organization_id);
    });
}

function assignMember(
  organization_id: string,
  email: string,
): Cypress.Chainable<Cypress.Response<{ success: boolean; error?: string }>> {
  return cy.request<{ success: boolean; error?: string }>({
    method: "POST",
    url: `/api/organizations/${organization_id}/members`,
    body: { input_mode: "email", identifier: email },
    failOnStatusCode: false,
  });
}

describe("Organization MFA requirement API", () => {
  it("guards who may read and change the requirement", () => {
    const organization_id = randomOrganizationId();
    registerUser().then((member) => {
      registerUser().then((outsider) => {
        registerAndStaySignedIn().then(() => {
          createOrganization(organization_id);
          // Grace period bounds
          for (const grace_period_days of [0, 91, 1.5]) {
            putRequirement(organization_id, { required: true, grace_period_days }).then((response) => {
              expect(response.status, `grace_period_days ${grace_period_days}`).to.eq(400);
            });
          }
          getRequirement(organization_id).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.data?.requirement.required).to.eq(false);
            expect(response.body.data?.requirement.members_without_mfa).to.deep.eq([]);
          });
          cy.logout();
        });

        loginAsSuperuser();
        assignMember(organization_id, member.email).its("status").should("eq", 201);
        putRequirement(SYSTEM_ORGANIZATION_ID, { required: true }).its("status").should("eq", 403);
        putRequirement("e2e-org-mfa-does-not-exist", { required: true }).its("status").should("eq", 404);
        cy.logout();

        loginAs(member);
        getRequirement(organization_id).then((response) => {
          expect(response.status).to.eq(200);
          // Only owners and platform admins see who lacks MFA
          expect(response.body.data?.requirement.members_without_mfa).to.eq(null);
        });
        putRequirement(organization_id, { required: true }).its("status").should("eq", 403);
        cy.request({ method: "POST", url: "/api/admin/organizations/enforce-mfa-requirements", failOnStatusCode: false })
          .its("status")
          .should("eq", 403);
        cy.logout();

        loginAs(outsider);
        getRequirement(organization_id).its("status").should("eq", 403);
        cy.logout();
      });
    });
  });

  it("gates joining, suspends members whose grace period ended and removes them on enforcement", () => {
    const organization_id = randomOrganizationId();
    registerUser().then((memberWithoutMfa) => {
      registerUser().then((memberWithMfa) => {
        registerUser().then((outsider) => {
          // The owner creates the organization while they have no MFA yet
          registerAndStaySignedIn().then((owner) => {
            createOrganization(organization_id);
            cy.logout();

            loginAsSuperuser();
            assignMember(organization_id, memberWithoutMfa.email).its("status").should("eq", 201);
            assignMember(organization_id, memberWithMfa.email).its("status").should("eq", 201);
            cy.logout();
            cy.enroll_test_user_mfa({ email: memberWithMfa.email });

            loginAs(owner);
            putRequirement(organization_id, { required: true, grace_period_days: 7 }).then((response) => {
              expect(response.status, "owner without MFA").to.eq(409);
              expect(response.body.error).to.eq("mfa_required");
            });
            cy.enroll_test_user_mfa({ email: owner.email });
            putRequirement(organization_id, { required: true, grace_period_days: 7 }).then((response) => {
              expect(response.status).to.eq(200);
              const requirement = response.body.data!.requirement;
              expect(requirement.required).to.eq(true);
              expect(requirement.grace_period_days).to.eq(7);
              expect(requirement.caller_has_mfa).to.eq(true);
              expect(requirement.members_without_mfa).to.have.length(1);
              const [lacking] = requirement.members_without_mfa!;
              expect(lacking!.uid).to.eq(memberWithoutMfa.uid);
              expect(lacking!.status).to.eq("grace_period");
              expect(lacking!.grace_period_reason).to.eq("requirement_enabled");
              expect(lacking!.grace_period_ends_at).to.be.closeTo(Date.now() + 7 * DAY_MS, 5 * 60 * 1000);
            });
            cy.logout();

            loginAsSuperuser();
            assignMember(organization_id, outsider.email).then((response) => {
              expect(response.status, "direct assignment without MFA").to.eq(409);
              expect(response.body.error).to.eq("mfa_required");
            });
            cy.logout();

            loginAs(memberWithoutMfa);
            myRequirements().then((body) => {
              expect(body.data?.mfa_enabled).to.eq(false);
              const entry = body.data?.organizations.find((o) => o.organization_id === organization_id);
              expect(entry?.status).to.eq("grace_period");
            });
            myOrganizationIds().should("include", organization_id);

            cy.request({
              method: "POST",
              url: "/api/test/seed/expire-organization-mfa-grace-period",
              body: { email: memberWithoutMfa.email, organization_id },
            });
            // Suspended: no longer a member for any purpose
            myOrganizationIds().should("not.include", organization_id);
            cy.request({ url: `/api/organizations/${organization_id}/members`, failOnStatusCode: false })
              .its("status")
              .should("eq", 403);
            myRequirements().then((body) => {
              const entry = body.data?.organizations.find((o) => o.organization_id === organization_id);
              expect(entry?.status).to.eq("expired");
            });
            cy.logout();

            loginAsSuperuser();
            cy.request<EnforcementResponseBody>({
              method: "POST",
              url: "/api/admin/organizations/enforce-mfa-requirements",
            }).then((response) => {
              expect(response.status).to.eq(200);
              const removed = (response.body.data?.removed_members ?? []).map(
                (m) => `${m.organization_id}/${m.uid}`,
              );
              expect(removed).to.include(`${organization_id}/${memberWithoutMfa.uid}`);
            });
            cy.request<{ data?: { members: Array<{ uid: string }> } }>(
              `/api/organizations/${organization_id}/members`,
            ).then((response) => {
              const uids = (response.body.data?.members ?? []).map((m) => m.uid);
              expect(uids).to.include.members([owner.uid, memberWithMfa.uid]);
              expect(uids).to.not.include(memberWithoutMfa.uid);
            });
            cy.logout();

            loginAs(memberWithoutMfa);
            myRequirements().then((body) => {
              expect(
                body.data?.organizations.some((o) => o.organization_id === organization_id),
              ).to.eq(false);
            });
            cy.logout();
          });
        });
      });
    });
  });

  it("refuses to accept an invitation without MFA until the invitee enables it", () => {
    const organization_id = randomOrganizationId();
    registerUser().then((invitee) => {
      registerAndStaySignedIn().then(() => {
        createOrganization(organization_id);
        cy.request<{ user: { email: string } }>(`/api/auth/whoami/${AUTH_APP_ID}`).then((whoami) =>
          cy.enroll_test_user_mfa({ email: whoami.body.user.email }),
        );
        putRequirement(organization_id, { required: true }).its("status").should("eq", 200);
        cy.request<{ data: { invitation: { invitation_id: string } } }>({
          method: "POST",
          url: `/api/organizations/${organization_id}/invitations`,
          body: { input_mode: "email", identifier: invitee.email },
        }).then((response) => {
          expect(response.status).to.eq(201);
          const invitation_id = response.body.data.invitation.invitation_id;
          cy.logout();

          loginAs(invitee);
          const respond = () =>
            cy.request<{ success: boolean; error?: string }>({
              method: "PATCH",
              url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
              body: { action: "accept" },
              failOnStatusCode: false,
            });
          respond().then((refused) => {
            expect(refused.status).to.eq(403);
            expect(refused.body.error).to.eq("mfa_required");
          });
          myOrganizationIds().should("not.include", organization_id);
          // The invitation stays pending: enabling MFA lets the invitee accept it
          cy.enroll_test_user_mfa({ email: invitee.email });
          respond().its("status").should("eq", 200);
          myOrganizationIds().should("include", organization_id);
          cy.logout();
        });
      });
    });
  });

  it("starts a grace period when a member removes their last factor and ends it when the requirement is turned off", () => {
    const organization_id = randomOrganizationId();
    registerAndStaySignedIn().then((owner) => {
      createOrganization(organization_id);
      cy.enroll_test_user_mfa({ email: owner.email }).then((enrollment) => {
        putRequirement(organization_id, { required: true, grace_period_days: 30 }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.data?.requirement.members_without_mfa).to.deep.eq([]);
        });

        cy.compute_totp_code(enrollment.secret).then((code: string) => {
          cy.request({
            method: "DELETE",
            url: `/api/user/mfa/totp/${enrollment.factor_id}`,
            body: { code },
          })
            .its("status")
            .should("eq", 200);
        });
        getRequirement(organization_id).then((response) => {
          const lacking = response.body.data?.requirement.members_without_mfa ?? [];
          expect(lacking).to.have.length(1);
          expect(lacking[0]!.uid).to.eq(owner.uid);
          expect(lacking[0]!.status).to.eq("grace_period");
          expect(lacking[0]!.grace_period_reason).to.eq("mfa_removed");
          expect(lacking[0]!.grace_period_ends_at).to.be.closeTo(Date.now() + 30 * DAY_MS, 5 * 60 * 1000);
        });
        myRequirements().then((body) => {
          const entry = body.data?.organizations.find((o) => o.organization_id === organization_id);
          expect(entry?.status).to.eq("grace_period");
          expect(entry?.grace_period_reason).to.eq("mfa_removed");
        });

        putRequirement(organization_id, { required: false }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.data?.requirement.required).to.eq(false);
          expect(response.body.data?.requirement.grace_period_days).to.eq(null);
        });
        myRequirements().then((body) => {
          expect(
            body.data?.organizations.some((o) => o.organization_id === organization_id),
          ).to.eq(false);
        });
        cy.logout();
      });
    });
  });
});
