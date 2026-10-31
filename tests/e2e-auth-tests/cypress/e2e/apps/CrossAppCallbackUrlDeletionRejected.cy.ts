// Verifies that an `app_callback_url_ref_id` is scoped to the app it belongs
// to on DELETE /api/apps/[app_id]/callback-urls/[app_callback_url_ref_id].
//
// The route's management guard (`loadAppForManagement`) only decides whether
// the caller may manage the app named in the *path*. The ref id in the path is
// trusted to belong to that same app, and the only thing that enforces it is
// the `.where("app_id", "=", app_id)` clause in `removeAppCallbackUrl()`
// (auth-server/src/lib/auth-db/apps/app-registry/app-callback-urls.ts). If that
// clause were ever dropped, anyone who can manage *any* app — every regular
// user can create one — could delete another app's registered callback URL by
// pointing the route at their own app and passing the victim's ref id.
//
// That is not merely vandalism: the explicit callback-URL allowlist is an
// exact-match `redirect_uri` check, and an app with no entries left falls back
// to the looser domain-origin matching (see `isRedirectUriRegisteredForClientApp`
// and the `oidc-confidential-clients` skill). Stripping a victim app's last
// callback URL therefore *downgrades* its redirect_uri validation.
//
// Existing coverage: apps/AppCallbackUrlsApi.cy.ts covers the lifecycle, body
// validation and the management guard (unknown app -> 404, hardcoded app ->
// 403, non-member of a private app -> 403), and deleting an already-removed
// ref id -> 404. No spec passed a ref id that belongs to a *different*,
// still-existing app while the caller legitimately manages the app in the path.

interface CallbackUrlRef {
  app_callback_url_ref_id: string;
  app_id: string;
  callback_url: string;
  environment: string;
  created_at: number;
}

interface ListCallbackUrlsResponseBody {
  success: boolean;
  message?: string;
  list?: CallbackUrlRef[];
}

interface MutationResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
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

function randomAppId(prefix: string): string {
  return `e2e-xcb-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createOwnApp(app_id: string): void {
  cy.request({
    method: "POST",
    url: "/api/apps",
    body: {
      app_id,
      app_name: `Cross-app callback URL E2E ${app_id}`,
      app_description: "Created by CrossAppCallbackUrlDeletionRejected.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      web: true,
    },
  }).then((response) => {
    expect(response.status, `app creation (${app_id})`).to.eq(200);
  });
}

describe("Cross-app callback URL deletion rejected", () => {
  it("DELETE /api/apps/:app_id/callback-urls/:ref_id refuses a ref id owned by another app (404) and leaves that URL registered", () => {
    const victim_app_id: string = randomAppId("victim");
    const attacker_app_id: string = randomAppId("attacker");
    const victim_callback_url = "https://victim.example/oauth/callback";

    // --- The victim: a regular user with their own app and one callback URL.
    cy.generate_random_test_user_credentials().then((victim) => {
      cy.create_and_login_as_regular_user_via_request(victim).then(
        (registered: boolean) => {
          expect(registered, "victim registration + login").to.be.true;
        },
      );
      createOwnApp(victim_app_id);

      const victim_ref: CallbackUrlRef = {
        app_callback_url_ref_id: generateV4Uuid(),
        app_id: victim_app_id,
        callback_url: victim_callback_url,
        environment: Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test",
        created_at: Date.now(),
      };

      cy.request<MutationResponseBody>({
        method: "POST",
        url: `/api/apps/${victim_app_id}/callback-urls`,
        body: victim_ref,
      }).then((response) => {
        expect(response.status, "register the victim's callback URL").to.eq(
          200,
        );
        expect(response.body.resource_id).to.eq(
          victim_ref.app_callback_url_ref_id,
        );
      });

      // --- The attacker: a different regular user with their own app, so the
      // route's management guard passes on the app named in the path.
      cy.logout_via_request();
      cy.generate_random_test_user_credentials().then((attacker) => {
        cy.create_and_login_as_regular_user_via_request(attacker).then(
          (registered: boolean) => {
            expect(registered, "attacker registration + login").to.be.true;
          },
        );
        createOwnApp(attacker_app_id);

        // Sanity check: the attacker really does manage their own app, so a
        // 404 below cannot be the management guard refusing the request.
        cy.request<ListCallbackUrlsResponseBody>({
          method: "GET",
          url: `/api/apps/${attacker_app_id}/callback-urls`,
        }).then((response) => {
          expect(
            response.status,
            "the attacker manages the app named in the path",
          ).to.eq(200);
          expect(response.body.list ?? []).to.deep.equal([]);
        });

        // The attack: the victim's ref id against the attacker's own app.
        cy.request<MutationResponseBody>({
          method: "DELETE",
          url: `/api/apps/${attacker_app_id}/callback-urls/${victim_ref.app_callback_url_ref_id}`,
          failOnStatusCode: false,
        }).then((response) => {
          expect(
            response.status,
            "deleting another app's callback URL ref id",
          ).to.eq(404);
          expect(response.body.success).to.eq(false);
        });

        // --- The victim's allowlist must be untouched.
        cy.logout_via_request();
        cy.login_via_request(victim.email, victim.password).then(
          (logged_in: boolean) => {
            expect(logged_in, "victim re-login").to.be.true;
          },
        );

        cy.request<ListCallbackUrlsResponseBody>({
          method: "GET",
          url: `/api/apps/${victim_app_id}/callback-urls`,
        }).then((response) => {
          expect(response.status, "the victim lists their callback URLs").to.eq(
            200,
          );
          const list: CallbackUrlRef[] = response.body.list ?? [];
          expect(
            list.map((entry) => entry.app_callback_url_ref_id),
            "the victim's callback URL must still be registered",
          ).to.include(victim_ref.app_callback_url_ref_id);
          expect(
            list.map((entry) => entry.callback_url),
            "the victim's callback URL value must be unchanged",
          ).to.include(victim_callback_url);
        });
      });
    });
  });
});
