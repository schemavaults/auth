// Organization membership of an organization-owned app's SERVICE ACCOUNT
// (PUT / DELETE /api/apps/[app_id]/service-account/organization-membership,
// migration 00043). Service accounts cannot accept invitations and are
// refused by direct member assignment, so an app's managers opt the
// service account into the organization that owns the app. The membership
// is what resource servers see through
// GET /api/resource-server/organizations/[organization_id]/members/[uid]/role
// (the lookup behind the server SDK's organization route guards), so this
// spec drives it from the API server's side with a JWKS access assertion,
// as ResourceServerOrganizationMemberRole.cy.ts does for people.

interface MemberRoleResponseBody {
  success: boolean;
  error?: string;
  data?: { organization_id: string; uid: string; role: string | null };
}

interface OrganizationMembership {
  available: boolean;
  organization_id: string | null;
  role: string | null;
}

interface ServiceAccountResponseBody {
  success: boolean;
  message?: string;
  service_account?: { uid: string } | null;
  organization_membership?: OrganizationMembership;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

function membershipUrl(app_id: string): string {
  return `/api/apps/${app_id}/service-account/organization-membership`;
}

interface Fixture {
  organization_id: string;
  api_server_id: string;
  private_key: string;
  app_id: string;
  service_account_uid: string;
}

/**
 * Creates an organization, an API server it owns (with a JWKS access key,
 * to ask the role endpoint as that resource server), and an app it owns
 * with a service account, as the signed-in superuser. Every spec of the
 * suite shares that superuser and its organization membership limit, so
 * the spec builds this once and deletes the organization afterwards
 * (which takes its apps, API servers and the service account with it).
 */
function setup(): Cypress.Chainable<Fixture> {
  const organization_id = randomId("e2e-saorg");
  const api_server_id = randomId("e2e-saorg-api");
  const app_id = randomId("e2e-saorg-app");

  cy.create_organization_via_request({
    organization_id,
    name: `Service account membership ${organization_id}`,
  });
  cy.request({
    method: "POST",
    url: "/api/apis",
    body: {
      api_server_id,
      api_server_name: `Service account API ${api_server_id}`,
      api_server_description: "ServiceAccountOrganizationMembership.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      owner_type: "organization",
      owner_organization_id: organization_id,
    },
  }).then((response) => expect(response.status).to.eq(200));
  cy.request({
    method: "POST",
    url: "/api/apps",
    body: {
      app_id,
      app_name: `Service account app ${app_id}`,
      app_description: "ServiceAccountOrganizationMembership.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      web: false,
      owner_type: "organization",
      owner_organization_id: organization_id,
    },
  }).then((response) => expect(response.status).to.eq(200));
  return cy
    .request<ServiceAccountResponseBody>({
      method: "POST",
      url: `/api/apps/${app_id}/service-account`,
    })
    .then((created) => {
      expect(created.status).to.eq(201);
      const service_account_uid = created.body.service_account?.uid;
      if (typeof service_account_uid !== "string") {
        throw new Error("Service account uid was not returned");
      }
      return cy.generate_jwks_access_key(api_server_id).then(({ private_key }) => {
        if (!private_key) {
          throw new Error("Failed to generate JWKS access key");
        }
        return cy.wrap<Fixture>(
          { organization_id, api_server_id, private_key, app_id, service_account_uid },
          { log: false },
        );
      });
    });
}

/** The role the auth server reports for `uid` to the organization's own API server. */
function resourceServerRole(f: Fixture, uid: string): Cypress.Chainable<string | null> {
  return cy
    .task("createJwksAccessProofToken", {
      api_server_id: f.api_server_id,
      private_key_pem: f.private_key,
    })
    .then((token) => {
      if (typeof token !== "string") {
        throw new TypeError("Expected createJwksAccessProofToken to yield a string");
      }
      return cy.request<MemberRoleResponseBody>({
        method: "GET",
        url: `/api/resource-server/organizations/${f.organization_id}/members/${uid}/role`,
        headers: { Authorization: `Bearer ${token}`, "X-Api-Server-Id": f.api_server_id },
        failOnStatusCode: false,
      });
    })
    .then((response) => {
      expect(response.status, `role lookup for ${uid}`).to.eq(200);
      expect(response.body.success).to.eq(true);
      expect(response.body.data?.uid).to.eq(uid);
      // Wrapped: a bare `null` return value would not become the subject.
      return cy.wrap<string | null>(response.body.data?.role ?? null, { log: false });
    });
}

function getServiceAccount(app_id: string): Cypress.Chainable<Cypress.Response<ServiceAccountResponseBody>> {
  return cy.request<ServiceAccountResponseBody>({
    method: "GET",
    url: `/api/apps/${app_id}/service-account`,
  });
}

function putMembership(
  app_id: string,
  body: Record<string, unknown>,
): Cypress.Chainable<Cypress.Response<ServiceAccountResponseBody>> {
  return cy.request<ServiceAccountResponseBody>({
    method: "PUT",
    url: membershipUrl(app_id),
    body,
    failOnStatusCode: false,
  });
}

function deleteMembership(app_id: string): Cypress.Chainable<Cypress.Response<ServiceAccountResponseBody>> {
  return cy.request<ServiceAccountResponseBody>({
    method: "DELETE",
    url: membershipUrl(app_id),
    failOnStatusCode: false,
  });
}

describe("Service account organization membership", () => {
  // Built once in before(); the tests that recreate the service account replace its uid.
  let f: Fixture;

  function loginAsSuperuser(): void {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) =>
      expect(ok, "superuser login").to.be.true,
    );
  }

  before(() => {
    loginAsSuperuser();
    setup().then((fixture) => {
      f = fixture;
    });
    // Each test signs in again from a clean cookie jar.
    cy.clearCookies();
  });

  beforeEach(() => {
    cy.clearCookies();
    loginAsSuperuser();
    // Every test starts with the service account outside the organization.
    cy.wrap(null, { log: false }).then(() => deleteMembership(f.app_id));
  });

  after(() => {
    cy.clearCookies();
    loginAsSuperuser();
    cy.wrap(null, { log: false }).then(() => {
      if (f) {
        cy.request({
          method: "DELETE",
          url: `/api/organizations/${f.organization_id}`,
          failOnStatusCode: false,
        });
      }
    });
  });

  it("is off by default: resource servers see no role for the service account", () => {
    resourceServerRole(f, f.service_account_uid).should("eq", null);
    getServiceAccount(f.app_id).then((response) => {
      expect(response.body.organization_membership).to.deep.equal({
        available: true,
        organization_id: f.organization_id,
        role: null,
      });
    });
  });

  it("makes the service account a member, then an owner, then removes it", () => {
    // The role defaults to `member`.
    putMembership(f.app_id, {}).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      expect(response.body.organization_membership).to.deep.equal({
        available: true,
        organization_id: f.organization_id,
        role: "member",
      });
    });
    resourceServerRole(f, f.service_account_uid).should("eq", "member");
    getServiceAccount(f.app_id).its("body.organization_membership.role").should("eq", "member");

    putMembership(f.app_id, { role: "owner" }).its("status").should("eq", 200);
    resourceServerRole(f, f.service_account_uid).should("eq", "owner");

    deleteMembership(f.app_id).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.organization_membership?.role).to.eq(null);
    });
    resourceServerRole(f, f.service_account_uid).should("eq", null);
    deleteMembership(f.app_id).its("status").should("eq", 404);
  });

  it("validates the role", () => {
    // `admin` is the virtual role of platform admins in the owner organization.
    for (const role of ["admin", "superuser", ""]) {
      putMembership(f.app_id, { role }).then((response) => {
        expect(response.status, `role '${role}'`).to.eq(400);
        expect(response.body.success).to.eq(false);
      });
    }
    resourceServerRole(f, f.service_account_uid).should("eq", null);
  });

  it("requires management access to the app", () => {
    cy.logout();
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then((ok: boolean) => {
        expect(ok, "regular user registration").to.be.true;
        putMembership(f.app_id, { role: "member" }).then((response) => {
          expect(response.status).to.eq(403);
          expect(response.body.success).to.eq(false);
        });
        deleteMembership(f.app_id).its("status").should("eq", 403);
      });
    });
    resourceServerRole(f, f.service_account_uid).should("eq", null);
  });

  /** Creates the app's service account again and makes it the fixture's uid. */
  function recreateServiceAccount(): void {
    cy.request<ServiceAccountResponseBody>({
      method: "POST",
      url: `/api/apps/${f.app_id}/service-account`,
    }).then((created) => {
      expect(created.status).to.eq(201);
      const new_uid = created.body.service_account?.uid as string;
      expect(new_uid).to.not.eq(f.service_account_uid);
      f.service_account_uid = new_uid;
    });
  }

  it("is cleared with the service account: a recreated one starts outside the organization", () => {
    putMembership(f.app_id, { role: "owner" }).its("status").should("eq", 200);
    cy.request({ method: "DELETE", url: `/api/apps/${f.app_id}/service-account` })
      .its("status")
      .should("eq", 200);
    resourceServerRole(f, f.service_account_uid).should("eq", null);
    getServiceAccount(f.app_id).its("body.organization_membership.role").should("eq", null);
    deleteMembership(f.app_id).its("status").should("eq", 404);
    // Without a service account there is nothing to make a member.
    putMembership(f.app_id, { role: "member" }).then((response) => {
      expect(response.status).to.eq(409);
      expect(response.body.success).to.eq(false);
    });
    getServiceAccount(f.app_id).its("body.organization_membership.role").should("eq", null);

    recreateServiceAccount();
    cy.wrap(null, { log: false }).then(() =>
      resourceServerRole(f, f.service_account_uid).should("eq", null),
    );
  });

  it("is cleared when an administrator deletes the service account's user", () => {
    putMembership(f.app_id, { role: "member" }).its("status").should("eq", 200);
    cy.wrap(null, { log: false }).then(() =>
      cy
        .request({ method: "DELETE", url: `/api/admin/users/${f.service_account_uid}` })
        .its("status")
        .should("eq", 200),
    );
    getServiceAccount(f.app_id).then((response) => {
      expect(response.body.service_account).to.eq(null);
      expect(response.body.organization_membership?.role).to.eq(null);
    });

    recreateServiceAccount();
    cy.wrap(null, { log: false }).then(() =>
      resourceServerRole(f, f.service_account_uid).should("eq", null),
    );
  });

  it("is set from the app page with an explicit Save, once the service account exists", () => {
    cy.request({ method: "DELETE", url: `/api/apps/${f.app_id}/service-account` })
      .its("status")
      .should("eq", 200);
    cy.intercept({
      method: "PUT",
      url: `**${membershipUrl(f.app_id)}`,
    }).as("saveMembership");
    cy.visit(`/apps/${f.app_id}`);
    cy.wait_for_page_hydration();

    // Nothing to be a member yet: the section only appears with the account.
    cy.get('[data-testid="app-service-account-card"]').should("be.visible");
    cy.get('[data-testid="service-account-organization-membership"]').should("not.exist");
    cy.contains("button", "Create service account").click();
    cy.get('[data-testid="service-account-organization-membership-status"]').should(
      "contain.text",
      "not a member",
    );
    cy.get('[data-testid="service-account-uid"]')
      .invoke("text")
      .then((uid) => {
        f.service_account_uid = uid.trim();
      });

    // Picking a role sends nothing until Save.
    cy.get('[data-testid="service-account-organization-role-save"]').should("be.disabled");
    cy.get('[data-testid="service-account-organization-role"]').click();
    cy.get('[data-testid="service-account-organization-role-option-member"]').click();
    cy.get('[data-testid="service-account-organization-role"]').should("contain.text", "Member");
    cy.get("@saveMembership.all").should("have.length", 0);
    cy.get('[data-testid="service-account-organization-membership-status"]').should(
      "contain.text",
      "not a member",
    );

    cy.get('[data-testid="service-account-organization-role-save"]').should("be.enabled").click();
    cy.wait("@saveMembership").then((interception) => {
      expect(interception.request.body).to.deep.eq({ role: "member" });
      expect(interception.response?.statusCode).to.eq(200);
    });
    cy.get('[data-testid="service-account-organization-membership-status"]')
      .should("not.contain.text", "not a member")
      .and("contain.text", "a member of");
    cy.get('[data-testid="service-account-organization-role-save"]').should("be.disabled");
    cy.wrap(null, { log: false }).then(() =>
      resourceServerRole(f, f.service_account_uid).should("eq", "member"),
    );
  });

  it("is refused for apps that no organization owns", () => {
    const app_id = randomId("e2e-saorg-user-app");
    cy.request({
      method: "POST",
      url: "/api/apps",
      body: {
        app_id,
        app_name: `Personal app ${app_id}`,
        app_description: "ServiceAccountOrganizationMembership.cy.ts",
        created_at: Date.now(),
        public: false,
        hardcoded: false,
        web: false,
        owner_type: "user",
      },
    }).then((response) => expect(response.status).to.eq(200));
    getServiceAccount(app_id).then((response) => {
      expect(response.body.organization_membership).to.deep.equal({
        available: false,
        organization_id: null,
        role: null,
      });
    });
    putMembership(app_id, { role: "member" }).then((response) => {
      expect(response.status).to.eq(409);
      expect(response.body.success).to.eq(false);
    });
    cy.request({ method: "DELETE", url: `/api/apps/${app_id}`, failOnStatusCode: false });
  });
});
