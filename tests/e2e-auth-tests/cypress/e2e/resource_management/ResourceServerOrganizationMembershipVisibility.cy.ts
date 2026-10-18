// An API server's ORGANIZATION MEMBERSHIP VISIBILITY (migration 00045):
// which organizations' memberships it may look up on the resource-server
// endpoints.
//
//  - PUT /api/apis/[api_server_id]/organization-membership-visibility
//    (platform administrators only) sets `owning_organization` (default) or
//    `all_organizations`.
//  - GET /api/resource-server/organizations/[organization_id]/members/[uid]/role
//    answers for another organization only with `all_organizations` AND the
//    user's access token for the API server in X-Subject-Token.
//  - GET /api/resource-server/users/[uid]/organizations always requires that
//    subject token and lists only the memberships the API server may see.
//
// The subject is a SERVICE ACCOUNT, because its access token for the API
// server can be minted by request (client_credentials): an app owned by a
// second organization ("other") is connected to an API server owned by a
// first one ("home"), and its service account is opted into "other". So the
// API server can always see "home" and sees "other" only through the grant.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

interface MemberRoleResponseBody {
  success: boolean;
  error?: string;
  data?: { organization_id: string; uid: string; role: string | null };
}

interface UserOrganizationsResponseBody {
  success: boolean;
  error?: string;
  data?: {
    uid: string;
    organization_membership_visibility: string;
    memberships: { organization_id: string; role: string }[];
  };
}

interface ApiServerResponseBody {
  success: boolean;
  message?: string;
  api_server?: { api_server_id: string; organization_membership_visibility?: string };
}

interface ServiceAccountResponseBody {
  success: boolean;
  service_account?: { uid: string } | null;
}

interface ClientSecretResponseBody {
  success: boolean;
  client_secret?: string;
}

interface TokenResponseBody {
  access_token?: string;
  error?: string;
}

interface WhoamiResponseBody {
  success: boolean;
  user?: { uid: string };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

interface Fixture {
  home_organization_id: string;
  other_organization_id: string;
  api_server_id: string;
  private_key: string;
  app_id: string;
  client_secret: string;
  service_account_uid: string;
  superuser_uid: string;
}

function loginAsSuperuser(): void {
  cy.create_and_login_as_superuser_via_request().then((ok: boolean) =>
    expect(ok, "superuser login").to.be.true,
  );
}

/** Builds the two organizations, the API server, the app and its service account (as the superuser). */
function setup(): Cypress.Chainable<Fixture> {
  const home_organization_id = randomId("e2e-msvis-home");
  const other_organization_id = randomId("e2e-msvis-other");
  const api_server_id = randomId("e2e-msvis-api");
  const app_id = randomId("e2e-msvis-app");

  cy.create_organization_via_request({
    organization_id: home_organization_id,
    name: `Membership visibility home ${home_organization_id}`,
  });
  cy.create_organization_via_request({
    organization_id: other_organization_id,
    name: `Membership visibility other ${other_organization_id}`,
  });
  cy.request({
    method: "POST",
    url: "/api/apis",
    body: {
      api_server_id,
      api_server_name: `Visibility API ${api_server_id}`,
      api_server_description: "ResourceServerOrganizationMembershipVisibility.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      owner_type: "organization",
      owner_organization_id: home_organization_id,
    },
  }).then((response) => expect(response.status).to.eq(200));
  cy.request({
    method: "POST",
    url: "/api/apps",
    body: {
      app_id,
      app_name: `Visibility app ${app_id}`,
      app_description: "ResourceServerOrganizationMembershipVisibility.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      web: false,
      owner_type: "organization",
      owner_organization_id: other_organization_id,
    },
  }).then((response) => expect(response.status).to.eq(200));
  cy.request({
    method: "POST",
    url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
  }).then((response) => expect(response.status).to.be.oneOf([200, 201]));

  let service_account_uid = "";
  let client_secret = "";
  let superuser_uid = "";
  cy.request<ServiceAccountResponseBody>({
    method: "POST",
    url: `/api/apps/${app_id}/service-account`,
  }).then((created) => {
    expect(created.status).to.eq(201);
    service_account_uid = created.body.service_account?.uid ?? "";
    expect(service_account_uid, "service account uid").to.not.be.empty;
  });
  cy.request({
    method: "PUT",
    url: `/api/apps/${app_id}/service-account/organization-membership`,
    body: { role: "member" },
  }).then((response) => expect(response.status).to.eq(200));
  cy.request<ClientSecretResponseBody>({
    method: "POST",
    url: `/api/apps/${app_id}/client-secret`,
  }).then((response) => {
    expect(response.status).to.be.oneOf([200, 201]);
    client_secret = response.body.client_secret ?? "";
    expect(client_secret, "client secret").to.not.be.empty;
  });
  cy.request<WhoamiResponseBody>({
    method: "GET",
    url: `/api/auth/whoami/${AUTH_APP_ID}`,
  }).then((response) => {
    superuser_uid = response.body.user?.uid ?? "";
  });

  return cy.generate_jwks_access_key(api_server_id).then(({ private_key }) => {
    if (!private_key) {
      throw new Error("Failed to generate JWKS access key");
    }
    return cy.wrap<Fixture>(
      {
        home_organization_id,
        other_organization_id,
        api_server_id,
        private_key,
        app_id,
        client_secret,
        service_account_uid,
        superuser_uid,
      },
      { log: false },
    );
  });
}

/** A client_credentials access token of the app's service account for the API server. */
function mintSubjectToken(f: Fixture): Cypress.Chainable<string> {
  return cy
    .request<TokenResponseBody>({
      method: "POST",
      url: "/api/oidc/token",
      form: true,
      headers: {
        Authorization: `Basic ${btoa(`${encodeURIComponent(f.app_id)}:${encodeURIComponent(f.client_secret)}`)}`,
      },
      body: { grant_type: "client_credentials", resource: f.api_server_id },
    })
    .then((response) => {
      expect(response.status, "client_credentials grant").to.eq(200);
      const token = response.body.access_token;
      if (typeof token !== "string" || token.length === 0) {
        throw new Error("No access token was issued");
      }
      return token;
    });
}

function base64url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Shaped like one of the platform's access tokens (a compact JWE whose
 * protected header carries the expected members) but not a real one: it
 * passes the X-Subject-Token parsing and must fail verification (403).
 */
function forgedSubjectToken(api_server_id: string): string {
  const header = base64url(
    JSON.stringify({
      alg: "RSA-OAEP-256",
      enc: "A256GCM",
      keyset_id: "00000000-0000-4000-8000-000000000000",
      kid: "00000000-0000-4000-8000-000000000000-decryption",
      aud: api_server_id,
    }),
  );
  return [header, "AAAA", "AAAA", "AAAA", "AAAA"].join(".");
}

function mintAssertion(f: Fixture): Cypress.Chainable<string> {
  return cy
    .task("createJwksAccessProofToken", {
      api_server_id: f.api_server_id,
      private_key_pem: f.private_key,
    })
    .then((token) => {
      if (typeof token !== "string") {
        throw new TypeError("Expected createJwksAccessProofToken to yield a string");
      }
      return token;
    });
}

function getRole(
  f: Fixture,
  organization_id: string,
  uid: string,
  subject_token?: string,
): Cypress.Chainable<Cypress.Response<MemberRoleResponseBody>> {
  return mintAssertion(f).then((assertion) =>
    cy.request<MemberRoleResponseBody>({
      method: "GET",
      url: `/api/resource-server/organizations/${organization_id}/members/${uid}/role`,
      headers: {
        Authorization: `Bearer ${assertion}`,
        "X-Api-Server-Id": f.api_server_id,
        ...(subject_token !== undefined ? { "X-Subject-Token": subject_token } : {}),
      },
      failOnStatusCode: false,
    }),
  );
}

function listOrganizations(
  f: Fixture,
  uid: string,
  subject_token?: string,
): Cypress.Chainable<Cypress.Response<UserOrganizationsResponseBody>> {
  return mintAssertion(f).then((assertion) =>
    cy.request<UserOrganizationsResponseBody>({
      method: "GET",
      url: `/api/resource-server/users/${uid}/organizations`,
      headers: {
        Authorization: `Bearer ${assertion}`,
        "X-Api-Server-Id": f.api_server_id,
        ...(subject_token !== undefined ? { "X-Subject-Token": subject_token } : {}),
      },
      failOnStatusCode: false,
    }),
  );
}

function setVisibility(
  api_server_id: string,
  organization_membership_visibility: unknown,
): Cypress.Chainable<Cypress.Response<ApiServerResponseBody>> {
  return cy.request<ApiServerResponseBody>({
    method: "PUT",
    url: `/api/apis/${api_server_id}/organization-membership-visibility`,
    body: { organization_membership_visibility },
    failOnStatusCode: false,
  });
}

describe("API server organization membership visibility", () => {
  let f: Fixture;

  before(() => {
    loginAsSuperuser();
    setup().then((fixture) => {
      f = fixture;
    });
    cy.clearCookies();
  });

  beforeEach(() => {
    cy.clearCookies();
    loginAsSuperuser();
    // Every test starts from the default.
    cy.wrap(null, { log: false }).then(() =>
      setVisibility(f.api_server_id, "owning_organization").its("status").should("eq", 200),
    );
  });

  after(() => {
    cy.clearCookies();
    loginAsSuperuser();
    cy.wrap(null, { log: false }).then(() => {
      if (f) {
        for (const organization_id of [f.other_organization_id, f.home_organization_id]) {
          cy.request({
            method: "DELETE",
            url: `/api/organizations/${organization_id}`,
            failOnStatusCode: false,
          });
        }
      }
    });
  });

  it("defaults to the owning organization and reports the setting on the API server", () => {
    cy.request<ApiServerResponseBody>({ method: "GET", url: `/api/apis/${f.api_server_id}` }).then(
      (response) => {
        expect(response.status).to.eq(200);
        expect(response.body.api_server?.organization_membership_visibility).to.eq("owning_organization");
      },
    );
    mintSubjectToken(f).then((subject_token) => {
      // Even with a valid subject token, another organization stays hidden.
      getRole(f, f.other_organization_id, f.service_account_uid, subject_token).then((response) => {
        expect(response.status).to.eq(403);
        expect(response.body.success).to.eq(false);
      });
      // The owning organization still answers without a subject token.
      getRole(f, f.home_organization_id, f.service_account_uid).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.data?.role).to.eq(null);
      });
      // ... but a subject token that is sent must be well-formed, needed or not.
      getRole(f, f.home_organization_id, f.service_account_uid, "not-a-token").then((response) => {
        expect(response.status, "malformed subject token on an own-organization lookup").to.eq(400);
      });
      // The list only contains what the API server may see: nothing here.
      listOrganizations(f, f.service_account_uid, subject_token).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.data?.uid).to.eq(f.service_account_uid);
        expect(response.body.data?.organization_membership_visibility).to.eq("owning_organization");
        expect(response.body.data?.memberships).to.deep.equal([]);
      });
    });
  });

  it("with all_organizations, answers for other organizations only with the user's own access token", () => {
    setVisibility(f.api_server_id, "all_organizations").then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.api_server?.organization_membership_visibility).to.eq("all_organizations");
    });
    mintSubjectToken(f).then((subject_token) => {
      getRole(f, f.other_organization_id, f.service_account_uid).then((response) => {
        expect(response.status, "no subject token").to.eq(403);
      });
      getRole(f, f.other_organization_id, f.service_account_uid, "not-a-token").then((response) => {
        expect(response.status, "malformed subject token").to.eq(400);
        expect(response.body.success).to.eq(false);
      });
      getRole(f, f.other_organization_id, f.service_account_uid, forgedSubjectToken(f.api_server_id)).then((response) => {
        expect(response.status, "well-formed but forged subject token").to.eq(403);
      });
      getRole(f, f.other_organization_id, f.superuser_uid, subject_token).then((response) => {
        expect(response.status, "subject token of another user").to.eq(403);
      });
      getRole(f, f.other_organization_id, f.service_account_uid, subject_token).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.data).to.deep.equal({
          organization_id: f.other_organization_id,
          uid: f.service_account_uid,
          role: "member",
        });
      });

      listOrganizations(f, f.service_account_uid, subject_token).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.data?.organization_membership_visibility).to.eq("all_organizations");
        const memberships = response.body.data?.memberships ?? [];
        expect(memberships.map((m) => [m.organization_id, m.role])).to.deep.equal([
          [f.other_organization_id, "member"],
        ]);
      });
      listOrganizations(f, f.superuser_uid, subject_token).then((response) => {
        expect(response.status, "list with another user's token").to.eq(403);
      });
    });

    // Back to the default: the other organization is hidden again.
    setVisibility(f.api_server_id, "owning_organization").its("status").should("eq", 200);
    mintSubjectToken(f).then((subject_token) => {
      getRole(f, f.other_organization_id, f.service_account_uid, subject_token)
        .its("status")
        .should("eq", 403);
    });
  });

  it("the list endpoint requires the assertion and a subject token", () => {
    listOrganizations(f, f.service_account_uid).then((response) => {
      expect(response.status, "missing X-Subject-Token").to.eq(400);
    });
    cy.request({
      method: "GET",
      url: `/api/resource-server/users/${f.service_account_uid}/organizations`,
      headers: { "X-Api-Server-Id": f.api_server_id, "X-Subject-Token": "irrelevant" },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "missing assertion").to.eq(401);
    });
    listOrganizations(f, f.service_account_uid, "not-a-token").then((response) => {
      expect(response.status, "malformed subject token").to.eq(400);
    });
    listOrganizations(f, f.service_account_uid, forgedSubjectToken(f.api_server_id)).then((response) => {
      expect(response.status, "well-formed but forged subject token").to.eq(403);
    });
  });

  it("only platform administrators may change the visibility", () => {
    setVisibility(f.api_server_id, "everyone").its("status").should("eq", 400);
    setVisibility(AUTH_APP_ID, "all_organizations").its("status").should("eq", 403);

    cy.clearCookies();
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then((ok: boolean) =>
        expect(ok, "regular user registration").to.be.true,
      );
      setVisibility(f.api_server_id, "all_organizations").its("status").should("eq", 403);
    });
    cy.clearCookies();
    loginAsSuperuser();
    cy.request<ApiServerResponseBody>({ method: "GET", url: `/api/apis/${f.api_server_id}` })
      .its("body.api_server.organization_membership_visibility")
      .should("eq", "owning_organization");
  });

  it("no API server is ever created with a widened visibility, by a regular user or an admin", () => {
    // The definition schema accepts the field (a GET answer can be posted
    // back), so creation must refuse a non-default value rather than store it.

    function createApiServer(
      api_server_id: string,
      owner_organization_id: string,
      organization_membership_visibility?: string,
    ): Cypress.Chainable<Cypress.Response<{ success: boolean; message?: string }>> {
      return cy.request<{ success: boolean; message?: string }>({
        method: "POST",
        url: "/api/apis",
        body: {
          api_server_id,
          api_server_name: `Visibility creation ${api_server_id}`,
          api_server_description: "ResourceServerOrganizationMembershipVisibility.cy.ts",
          created_at: Date.now(),
          public: false,
          hardcoded: false,
          owner_type: "organization",
          owner_organization_id,
          ...(organization_membership_visibility !== undefined ? { organization_membership_visibility } : {}),
        },
        failOnStatusCode: false,
      });
    }

    function expectNotCreated(api_server_id: string): void {
      cy.request({ method: "GET", url: `/api/apis/${api_server_id}`, failOnStatusCode: false })
        .its("status")
        .should("eq", 404);
    }

    function expectCreatedWithDefault(api_server_id: string): void {
      cy.request<ApiServerResponseBody>({ method: "GET", url: `/api/apis/${api_server_id}` })
        .its("body.api_server.organization_membership_visibility")
        .should("eq", "owning_organization");
    }

    // A regular user who owns an organization (so may create API servers for it).
    const user_organization_id = randomId("e2e-msvis-user");
    cy.clearCookies();
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then((ok: boolean) =>
        expect(ok, "regular user registration").to.be.true,
      );
      cy.create_organization_via_request({
        organization_id: user_organization_id,
        name: `Membership visibility user org ${user_organization_id}`,
      });

      const widened = randomId("e2e-msvis-user-wide");
      createApiServer(widened, user_organization_id, "all_organizations").then((response) => {
        expect(response.status, "regular user creating with all_organizations").to.eq(400);
        expect(response.body.success).to.eq(false);
      });
      expectNotCreated(widened);

      createApiServer(randomId("e2e-msvis-user-bad"), user_organization_id, "everyone")
        .its("status")
        .should("eq", 400);

      const defaulted = randomId("e2e-msvis-user-default");
      createApiServer(defaulted, user_organization_id, "owning_organization").its("status").should("eq", 200);
      expectCreatedWithDefault(defaulted);
      // ... and the owner still cannot widen it afterwards.
      setVisibility(defaulted, "all_organizations").its("status").should("eq", 403);

      const omitted = randomId("e2e-msvis-user-omitted");
      createApiServer(omitted, user_organization_id).its("status").should("eq", 200);
      expectCreatedWithDefault(omitted);
    });

    // A platform administrator cannot set it at creation either: the PUT is the only way in.
    cy.clearCookies();
    loginAsSuperuser();
    const adminWidened = randomId("e2e-msvis-admin-wide");
    createApiServer(adminWidened, f.home_organization_id, "all_organizations")
      .its("status")
      .should("eq", 400);
    expectNotCreated(adminWidened);

    // The regular user's organization takes its API servers with it.
    cy.request({
      method: "DELETE",
      url: `/api/organizations/${user_organization_id}`,
      failOnStatusCode: false,
    });
  });
});
