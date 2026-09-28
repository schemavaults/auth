// The platform administrators' "Add Member" dialog
// (AssignOrganizationMemberDialog in @schemavaults/auth-ui), which adds a
// user to an organization directly through
// POST /api/organizations/[organization_id]/members:
//   - on an organization's page (/orgs/[organization_id]): by e-mail as
//     owner, and "Myself",
//   - errors (an existing member) keep the dialog open with an error toast,
//   - on a user's admin page (/admin/users/[uid]): "Add to Organization"
//     with an organization select that never offers the system
//     organization.
// That owners never see the button (and that the endpoint refuses every
// non-admin) is pinned by DirectMemberAssignmentAuthorization.cy.ts.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();
const SYSTEM_ORGANIZATION_ID = "schemavaults";

const OPEN_BUTTON_ID = "open-assign-organization-member-dialog-button";
const DIALOG_ID = "assign-organization-member-dialog-content";

interface User {
  email: string;
  password: string;
  uid: string;
}

interface MembersResponseBody {
  success: boolean;
  data?: { members: Array<{ uid: string; role: string }> };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function whoami(): Cypress.Chainable<{ uid: string; email: string }> {
  return cy
    .request<{ user: { uid: string; email: string } }>(
      `/api/auth/whoami/${AUTH_APP_ID}`,
    )
    .then((response) => response.body.user);
}

/** Registers a fresh regular user via request and logs them out again. */
function registerUser(): Cypress.Chainable<User> {
  return cy.generate_random_test_user_credentials().then((credentials) =>
    cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((ok: boolean) => {
        expect(ok, "registration").to.be.true;
        return whoami();
      })
      .then(({ uid }) => {
        cy.logout();
        return cy.wrap<User>({ ...credentials, uid }, { log: false });
      }),
  );
}

function loginAsSuperuser(): void {
  cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
    if (!ok) throw new Error("Failed to login as superuser");
  });
}

function randomOrganizationId(): string {
  return `e2e-assign-ui-${Math.random().toString(36).slice(2, 10)}`;
}

function roleOf(
  organization_id: string,
  uid: string,
): Cypress.Chainable<string | null> {
  return cy
    .request<MembersResponseBody>(`/api/organizations/${organization_id}/members`)
    .then((response) =>
      cy.wrap(
        (response.body.data?.members ?? []).find((m) => m.uid === uid)?.role ??
          null,
        { log: false },
      ),
    );
}

function interceptAssign(organization_id: string): void {
  cy.intercept({
    method: "POST",
    url: `**/api/organizations/${organization_id}/members`,
  }).as("assignRequest");
}

describe("Admin Add Member dialog", () => {
  it("adds a user by e-mail as owner from the organization's page", () => {
    const organization_id = randomOrganizationId();
    registerUser().then((target) => {
      loginAsSuperuser();
      cy.create_organization_via_request({
        organization_id,
        name: `Assign dialog ${organization_id}`,
      });

      cy.visit(`/orgs/${organization_id}`);
      cy.wait_for_page_hydration();
      // Administrators get both: the invitation and the direct assignment.
      cy.get("button#open-invite-member-dialog-button").should("be.visible");
      cy.open_dialog_with_button(OPEN_BUTTON_ID, DIALOG_ID);

      cy.get('[data-testid="assign-member-input-mode-email"]').should(
        "have.attr",
        "data-state",
        "checked",
      );
      cy.get('[data-testid="assign-member-role-member"]').should(
        "have.attr",
        "data-state",
        "checked",
      );
      cy.get('[data-testid="assign-member-identifier-input"]').type(target.email);
      cy.get('[data-testid="assign-member-role-owner"]').click();

      interceptAssign(organization_id);
      cy.get('[data-testid="submit-assign-member-form-button"]').click();
      cy.wait("@assignRequest").then((interception) => {
        expect(interception.response?.statusCode).to.eq(201);
        expect(interception.request.body).to.deep.eq({
          input_mode: "email",
          identifier: target.email,
          role: "owner",
        });
      });

      cy.get(`#${DIALOG_ID}`).should("not.exist");
      cy.contains("tr", target.email).should("contain.text", "owner");
      roleOf(organization_id, target.uid).should("eq", "owner");

      cy.delete_organization({ organization_id });
    });
  });

  it("adds the administrator themselves with \"Myself\"", () => {
    const organization_id = randomOrganizationId();
    registerUser().then((creator) => {
      cy.login_via_request(creator.email, creator.password);
      cy.create_organization_via_request({
        organization_id,
        name: `Assign dialog self ${organization_id}`,
      });
      cy.logout();

      loginAsSuperuser();
      whoami().then((admin) => {
        cy.visit(`/orgs/${organization_id}`);
        cy.wait_for_page_hydration();
        cy.open_dialog_with_button(OPEN_BUTTON_ID, DIALOG_ID);

        cy.get('[data-testid="assign-member-input-mode-self"]').click();
        cy.get('[data-testid="assign-member-identifier-input"]').should("not.exist");
        cy.get('[data-testid="assign-member-self-summary"]').should(
          "contain.text",
          admin.email,
        );

        interceptAssign(organization_id);
        cy.get('[data-testid="submit-assign-member-form-button"]').click();
        cy.wait("@assignRequest").then((interception) => {
          expect(interception.response?.statusCode).to.eq(201);
          expect(interception.request.body).to.deep.eq({
            input_mode: "uid",
            identifier: admin.uid,
            role: "member",
          });
        });

        cy.get(`#${DIALOG_ID}`).should("not.exist");
        cy.contains("tr", admin.email).should("contain.text", "member");
        roleOf(organization_id, admin.uid).should("eq", "member");
      });

      cy.delete_organization({ organization_id });
    });
  });

  it("keeps the dialog open and shows the error when the user already is a member", () => {
    const organization_id = randomOrganizationId();
    registerUser().then((creator) => {
      cy.login_via_request(creator.email, creator.password);
      cy.create_organization_via_request({
        organization_id,
        name: `Assign dialog error ${organization_id}`,
      });
      cy.logout();

      loginAsSuperuser();
      cy.visit(`/orgs/${organization_id}`);
      cy.wait_for_page_hydration();
      cy.open_dialog_with_button(OPEN_BUTTON_ID, DIALOG_ID);

      cy.get('[data-testid="assign-member-identifier-input"]').type(creator.email);
      interceptAssign(organization_id);
      cy.get('[data-testid="submit-assign-member-form-button"]').click();
      cy.wait("@assignRequest")
        .its("response.statusCode")
        .should("eq", 409);

      cy.get("li.toast[data-variant='destructive']").should(
        "contain.text",
        "already a member",
      );
      cy.get(`#${DIALOG_ID}`).should("be.visible");
      roleOf(organization_id, creator.uid).should("eq", "owner");

      cy.delete_organization({ organization_id });
    });
  });

  it("adds a user to an organization from their admin page", () => {
    const organization_id = randomOrganizationId();
    registerUser().then((target) => {
      loginAsSuperuser();
      cy.create_organization_via_request({
        organization_id,
        name: `Assign dialog admin page ${organization_id}`,
      });

      cy.visit(`/admin/users/${target.uid}`);
      cy.wait_for_page_hydration();
      cy.get(`[data-testid="admin-user-org-link-${organization_id}"]`).should(
        "not.exist",
      );
      cy.open_dialog_with_button(OPEN_BUTTON_ID, DIALOG_ID);
      cy.get('[data-testid="assign-member-fixed-user"]').should(
        "contain.text",
        target.email,
      );
      // The user is fixed: no identifier to type.
      cy.get('[data-testid="assign-member-identifier-input"]').should("not.exist");

      cy.get('[data-testid="assign-member-organization-select"]').click();
      cy.get(
        `[data-testid="assign-member-organization-select-option-${SYSTEM_ORGANIZATION_ID}"]`,
      ).should("not.exist");
      cy.get(
        `[data-testid="assign-member-organization-select-option-${organization_id}"]`,
      ).click();
      cy.get('[data-testid="assign-member-organization-select"]').should(
        "contain.text",
        organization_id,
      );

      interceptAssign(organization_id);
      cy.get('[data-testid="submit-assign-member-form-button"]').click();
      cy.wait("@assignRequest").then((interception) => {
        expect(interception.response?.statusCode).to.eq(201);
        expect(interception.request.body).to.deep.eq({
          input_mode: "uid",
          identifier: target.uid,
          role: "member",
        });
      });

      cy.get(`#${DIALOG_ID}`).should("not.exist");
      cy.get(`[data-testid="admin-user-org-link-${organization_id}"]`).should(
        "be.visible",
      );
      roleOf(organization_id, target.uid).should("eq", "member");

      cy.delete_organization({ organization_id });
    });
  });
});
