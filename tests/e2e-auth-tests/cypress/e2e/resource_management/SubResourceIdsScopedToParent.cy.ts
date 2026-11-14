// Sub-resource reference ids are scoped to their parent resource.
//
// Apps and API servers own sub-resources that are addressed by their own
// reference id in the route, underneath the parent's id:
//
//   DELETE /api/apps/{app_id}/domains/{app_domain_ref_id}
//   DELETE /api/apps/{app_id}/callback-urls/{app_callback_url_ref_id}
//   DELETE /api/apis/{api_server_id}/domains/{api_server_domain_ref_id}
//   PATCH  /api/apis/{api_server_id}/scopes/{api_server_scope_id}
//   DELETE /api/apis/{api_server_id}/scopes/{api_server_scope_id}
//
// Every one of these authorizes the caller against the PARENT named in the
// path and then mutates the row by reference id. Each handler's query is
// (deliberately) filtered on both the parent id and the reference id, so a
// reference id belonging to a different app / API server matches nothing and
// answers 404 ("No such app, or no domain with the given id for this app"
// and friends). Drop the parent-id predicate from any one of those queries
// and a caller who manages ANY app could delete another app's domain or
// callback URL, and a caller who manages any API server could rewrite or
// delete another API server's scope definitions - without ever being
// refused by an authorization check.
//
// Existing coverage of these routes only ever passes a reference id that
// belongs to the parent in the path (apps/AppCallbackUrlsApi.cy.ts,
// apps/AppDetailPageRemoveDomain.cy.ts, apis/ApiServerDetailPageRemoveDomain.cy.ts,
// example_resource_server/ApiScopes.cy.ts), or an unknown/already-deleted
// one; none of them crosses the parent boundary. The equivalent guard for
// organization invitations (`invitation.organization_id !== organization_id`)
// IS pinned, by organizations/InvitationDeclineApi.cy.ts - this spec pins the
// app / API server side of the same class of bug.
//
// The caller here owns BOTH parents, so authorization always passes: that
// isolates the parent-scoping behaviour from the management-access checks,
// which are covered by apps/NonOrgMemberCannotDeleteApp.cy.ts,
// apis/OrgMemberCannotAddApiServerDomain.cy.ts and
// example_resource_server/ApiScopes.cy.ts.

interface ResourceCreationResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
}

interface MutationResponseBody {
  success: boolean;
  message?: string;
}

interface AppDomainRef {
  app_domain_ref_id: string;
  app_id: string;
  domain: string;
}

interface AppCallbackUrlRef {
  app_callback_url_ref_id: string;
  app_id: string;
  callback_url: string;
}

interface ApiServerDomainRef {
  api_server_domain_ref_id: string;
  api_server_id: string;
  domain: string;
}

interface ApiServerScope {
  api_server_scope_id: string;
  api_server_id: string;
  scope: string;
  description: string;
  allow_dynamic_clients: boolean;
}

interface ListResponseBody<T> {
  success: boolean;
  message?: string;
  list?: T[];
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

// crypto.randomUUID() is unavailable in the spec's browser context.
function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 12);
}

function environment(): string {
  return Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test";
}

/** Registers and signs in a fresh regular user who owns everything below. */
function loginAsFreshRegularUser(): void {
  cy.generate_random_test_user_credentials()
    .then((credentials) =>
      cy.create_and_login_as_regular_user_via_request(credentials),
    )
    .then((ok: boolean) => {
      expect(ok, "regular user registration + login").to.be.true;
    });
}

/** Creates a user-owned client application and returns its app id. */
function createOwnApp(label: string): string {
  const app_id = `e2e-subres-${label}-${randomSuffix()}`;
  cy.request<ResourceCreationResponseBody>({
    method: "POST",
    url: "/api/apps",
    body: {
      app_id,
      app_name: `Sub-resource isolation ${app_id}`,
      app_description: "Created by SubResourceIdsScopedToParent.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      web: true,
    },
  }).then((response) => {
    expect(response.status, `app creation (${label})`).to.eq(200);
    expect(response.body.success, `app creation success (${label})`).to.eq(true);
  });
  return app_id;
}

/** Creates a user-owned API server and returns its id. */
function createOwnApiServer(label: string): string {
  const api_server_id = generateV4Uuid();
  cy.request<ResourceCreationResponseBody>({
    method: "POST",
    url: "/api/apis",
    body: {
      api_server_id,
      api_server_name: `Sub-resource isolation ${label} ${randomSuffix()}`,
      api_server_description: "Created by SubResourceIdsScopedToParent.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
    },
  }).then((response) => {
    expect(response.status, `API server creation (${label})`).to.eq(200);
    expect(response.body.success, `API server creation success (${label})`).to.eq(
      true,
    );
  });
  return api_server_id;
}

describe("Sub-resource reference ids are scoped to their parent resource", () => {
  beforeEach(() => {
    cy.reset_rate_limit();
  });

  it("DELETE /api/apps/{app_id}/domains/{ref} refuses a domain reference id belonging to another app", () => {
    loginAsFreshRegularUser();
    const owning_app_id = createOwnApp("dom-a");
    const other_app_id = createOwnApp("dom-b");

    const app_domain_ref_id = generateV4Uuid();
    const domain = `https://subres-${randomSuffix()}.example.test`;
    cy.request<ResourceCreationResponseBody>({
      method: "POST",
      url: `/api/apps/${owning_app_id}/domains`,
      body: {
        app_domain_ref_id,
        app_id: owning_app_id,
        domain,
        environment: environment(),
        created_at: Date.now(),
        hardcoded: false,
      },
    }).then((response) => {
      expect(response.status, "add domain to the owning app").to.eq(200);
    });

    // The caller manages the other app too, so this is not an authorization
    // failure: the reference id simply does not belong to that app.
    cy.request<MutationResponseBody>({
      method: "DELETE",
      url: `/api/apps/${other_app_id}/domains/${app_domain_ref_id}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(
        response.status,
        "delete another app's domain ref through this app",
      ).to.eq(404);
      expect(response.body.success).to.eq(false);
    });

    cy.request<ListResponseBody<AppDomainRef>>({
      method: "GET",
      url: `/api/apps/${owning_app_id}/domains`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      const ids = (response.body.list ?? []).map((d) => d.app_domain_ref_id);
      expect(ids, "the domain survives on the app that owns it").to.include(
        app_domain_ref_id,
      );
    });
  });

  it("DELETE /api/apps/{app_id}/callback-urls/{ref} refuses a callback URL reference id belonging to another app", () => {
    loginAsFreshRegularUser();
    const owning_app_id = createOwnApp("cb-a");
    const other_app_id = createOwnApp("cb-b");

    const app_callback_url_ref_id = generateV4Uuid();
    const callback_url = `https://subres-${randomSuffix()}.example.test/oauth2/callback`;
    cy.request<ResourceCreationResponseBody>({
      method: "POST",
      url: `/api/apps/${owning_app_id}/callback-urls`,
      body: {
        app_callback_url_ref_id,
        app_id: owning_app_id,
        callback_url,
        environment: environment(),
        created_at: Date.now(),
      },
    }).then((response) => {
      expect(response.status, "register callback URL on the owning app").to.eq(
        200,
      );
    });

    cy.request<MutationResponseBody>({
      method: "DELETE",
      url: `/api/apps/${other_app_id}/callback-urls/${app_callback_url_ref_id}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(
        response.status,
        "delete another app's callback URL ref through this app",
      ).to.eq(404);
      expect(response.body.success).to.eq(false);
    });

    cy.request<ListResponseBody<AppCallbackUrlRef>>({
      method: "GET",
      url: `/api/apps/${owning_app_id}/callback-urls`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      const ids = (response.body.list ?? []).map(
        (u) => u.app_callback_url_ref_id,
      );
      expect(
        ids,
        "the callback URL survives on the app that owns it",
      ).to.include(app_callback_url_ref_id);
    });
  });

  it("DELETE /api/apis/{api_server_id}/domains/{ref} refuses a domain reference id belonging to another API server", () => {
    loginAsFreshRegularUser();
    const owning_api_server_id = createOwnApiServer("dom-a");
    const other_api_server_id = createOwnApiServer("dom-b");

    const api_server_domain_ref_id = generateV4Uuid();
    const domain = `https://subres-api-${randomSuffix()}.example.test`;
    cy.request<ResourceCreationResponseBody>({
      method: "POST",
      url: `/api/apis/${owning_api_server_id}/domains`,
      body: {
        api_server_domain_ref_id,
        api_server_id: owning_api_server_id,
        domain,
        environment: environment(),
        created_at: Date.now(),
        hardcoded: false,
      },
    }).then((response) => {
      expect(response.status, "add domain to the owning API server").to.eq(200);
    });

    cy.request<MutationResponseBody>({
      method: "DELETE",
      url: `/api/apis/${other_api_server_id}/domains/${api_server_domain_ref_id}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(
        response.status,
        "delete another API server's domain ref through this API server",
      ).to.eq(404);
      expect(response.body.success).to.eq(false);
    });

    cy.request<ListResponseBody<ApiServerDomainRef>>({
      method: "GET",
      url: `/api/apis/${owning_api_server_id}/domains`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      const ids = (response.body.list ?? []).map(
        (d) => d.api_server_domain_ref_id,
      );
      expect(
        ids,
        "the domain survives on the API server that owns it",
      ).to.include(api_server_domain_ref_id);
    });
  });

  it("PATCH /api/apis/{api_server_id}/scopes/{scope_id} refuses a scope id belonging to another API server", () => {
    loginAsFreshRegularUser();
    const owning_api_server_id = createOwnApiServer("scope-patch-a");
    const other_api_server_id = createOwnApiServer("scope-patch-b");

    const scope = `e2e:subres.patch.${randomSuffix()}`;
    cy.request<{ success: boolean; scope: ApiServerScope }>({
      method: "POST",
      url: `/api/apis/${owning_api_server_id}/scopes`,
      body: { scope, description: "Defined by the owning API server" },
    }).then((created) => {
      expect(created.status, "define scope on the owning API server").to.eq(200);
      const api_server_scope_id = created.body.scope.api_server_scope_id;

      cy.request<MutationResponseBody>({
        method: "PATCH",
        url: `/api/apis/${other_api_server_id}/scopes/${api_server_scope_id}`,
        body: { description: "Rewritten through another API server" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(
          response.status,
          "patch another API server's scope through this API server",
        ).to.eq(404);
        expect(response.body.success).to.eq(false);
      });

      cy.request<ListResponseBody<ApiServerScope>>({
        method: "GET",
        url: `/api/apis/${owning_api_server_id}/scopes`,
      }).then((response) => {
        expect(response.status).to.eq(200);
        const row = (response.body.list ?? []).find(
          (s) => s.api_server_scope_id === api_server_scope_id,
        );
        expect(row, "the scope still exists on the API server that owns it").to
          .exist;
        expect(row?.description, "its description is unchanged").to.eq(
          "Defined by the owning API server",
        );
      });
    });
  });

  it("DELETE /api/apis/{api_server_id}/scopes/{scope_id} refuses a scope id belonging to another API server", () => {
    loginAsFreshRegularUser();
    const owning_api_server_id = createOwnApiServer("scope-delete-a");
    const other_api_server_id = createOwnApiServer("scope-delete-b");

    const scope = `e2e:subres.delete.${randomSuffix()}`;
    cy.request<{ success: boolean; scope: ApiServerScope }>({
      method: "POST",
      url: `/api/apis/${owning_api_server_id}/scopes`,
      body: { scope, description: "Defined by the owning API server" },
    }).then((created) => {
      expect(created.status, "define scope on the owning API server").to.eq(200);
      const api_server_scope_id = created.body.scope.api_server_scope_id;

      cy.request<MutationResponseBody>({
        method: "DELETE",
        url: `/api/apis/${other_api_server_id}/scopes/${api_server_scope_id}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(
          response.status,
          "delete another API server's scope through this API server",
        ).to.eq(404);
        expect(response.body.success).to.eq(false);
      });

      cy.request<ListResponseBody<ApiServerScope>>({
        method: "GET",
        url: `/api/apis/${owning_api_server_id}/scopes`,
      }).then((response) => {
        expect(response.status).to.eq(200);
        const ids = (response.body.list ?? []).map((s) => s.api_server_scope_id);
        expect(
          ids,
          "the scope survives on the API server that owns it",
        ).to.include(api_server_scope_id);
      });
    });
  });
});
