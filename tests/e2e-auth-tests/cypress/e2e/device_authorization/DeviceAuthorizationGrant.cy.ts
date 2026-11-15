// The OAuth 2.0 Device Authorization Grant (RFC 8628) end to end, with apps
// created through the management API (no seeding, no resource server):
//   1. discovery advertises the device authorization endpoint and grant;
//   2. an app can only start device flows once its managers enable the grant
//      (`PUT /api/apps/{app_id}/device-authorization`), and disabling it cuts
//      off a pending request;
//   3. the device polls: `authorization_pending`, `slow_down` when it polls
//      too fast, then the user approves on `/device` (reached signed out
//      through the login page, with the code kept) and the device receives
//      access + refresh + id_token exactly once;
//   4. a denied request answers `access_denied`;
//   5. unknown codes are refused and, after a handful, rate limited;
//   6. approvals and denials land in the user's audit log.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

interface DeviceAuthorizationBody {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
}

interface TokenBody {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
}

interface TestUserCredentials {
  email: string;
  password: string;
}

function createApp(): Cypress.Chainable<string> {
  const app_id = `e2e-device-${Math.random().toString(36).slice(2, 12)}`;
  return cy
    .create_and_login_as_superuser_via_request()
    .then((ok: boolean) => {
      expect(ok, "signed in as the superuser").to.be.true;
      return cy.request({
        method: "POST",
        url: "/api/apps",
        body: {
          app_id,
          app_name: `Device CLI ${app_id}`,
          app_description: "DeviceAuthorizationGrant.cy.ts",
          created_at: Date.now(),
          public: true,
          hardcoded: false,
          web: false,
        },
      });
    })
    .then((response) => {
      expect(response.status).to.eq(200);
      return cy.wrap(app_id, { log: false });
    });
}

/** Signed in as the superuser: turns the grant on or off for `app_id`. */
function setDeviceAuthorization(app_id: string, enabled: boolean): void {
  cy.request({
    method: "PUT",
    url: `/api/apps/${app_id}/device-authorization`,
    body: { enabled },
  }).then((response) => {
    expect(response.status).to.eq(200);
    expect(response.body.enabled).to.eq(enabled);
    expect(response.body.available).to.eq(true);
  });
}

function requestDeviceAuthorization(
  client_id: string,
  scope = "openid email",
): Cypress.Chainable<Cypress.Response<DeviceAuthorizationBody>> {
  return cy.request<DeviceAuthorizationBody>({
    method: "POST",
    url: "/api/oidc/device_authorization",
    form: true,
    body: { client_id, scope },
    failOnStatusCode: false,
  });
}

function poll(client_id: string, device_code: string): Cypress.Chainable<Cypress.Response<TokenBody>> {
  return cy.request<TokenBody>({
    method: "POST",
    url: "/api/oidc/token",
    form: true,
    body: { grant_type: DEVICE_CODE_GRANT, client_id, device_code },
    failOnStatusCode: false,
  });
}

/** A fresh, e-mail-verified regular user, signed in on the auth server. */
function signInFreshUser(): Cypress.Chainable<TestUserCredentials> {
  return cy.generate_random_test_user_credentials().then((credentials: TestUserCredentials) => {
    cy.logout_via_request();
    cy.create_and_login_as_regular_user_via_request(credentials).then((ok: boolean) => expect(ok).to.be.true);
    cy.verify_email_via_request(credentials.email).then((ok: boolean) => expect(ok).to.be.true);
    return cy.wrap(credentials, { log: false });
  });
}

describe("Device authorization grant (RFC 8628)", () => {
  beforeEach(() => {
    cy.request("POST", "/api/test/reset-rate-limit");
  });

  it("is advertised in the discovery document", () => {
    cy.request("/.well-known/openid-configuration").then((response) => {
      expect(response.body.device_authorization_endpoint).to.match(/\/api\/oidc\/device_authorization$/);
      expect(response.body.grant_types_supported).to.include(DEVICE_CODE_GRANT);
    });
  });

  it("is refused until the app's managers enable it, and disabling it cuts off pending requests", () => {
    createApp().then((app_id) => {
      requestDeviceAuthorization(app_id).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.error).to.eq("unauthorized_client");
      });
      cy.request(`/api/apps/${app_id}/device-authorization`).its("body.enabled").should("eq", false);

      setDeviceAuthorization(app_id, true);
      requestDeviceAuthorization(app_id).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.headers["cache-control"]).to.contain("no-store");
        const body = response.body;
        expect(body.user_code).to.match(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
        expect(body.verification_uri).to.match(/\/device$/);
        expect(body.verification_uri_complete).to.contain(`/device?user_code=${body.user_code}`);
        expect(body.expires_in).to.be.within(890, 900);
        expect(body.interval).to.eq(5);

        setDeviceAuthorization(app_id, false);
        poll(app_id, body.device_code as string).then((polled) => {
          expect(polled.status).to.eq(400);
          expect(polled.body.error).to.eq("unauthorized_client");
        });
        cy.request({
          method: "POST",
          url: "/api/auth/device/lookup",
          body: { user_code: body.user_code },
          failOnStatusCode: false,
        }).then((lookup) => {
          expect(lookup.status).to.eq(404);
          expect(lookup.body.error_id).to.eq("invalid_user_code");
        });
      });
      cy.request({
        method: "POST",
        url: "/api/oidc/device_authorization",
        form: true,
        body: { client_id: "e2e-no-such-device-app" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
        expect(response.body.error).to.eq("invalid_client");
      });
    });
  });

  it("signs the device in once the user approves the code on /device", () => {
    createApp().then((app_id) => {
      setDeviceAuthorization(app_id, true);
      requestDeviceAuthorization(app_id, "openid email profile").then(({ body: authorization }) => {
        const device_code = authorization.device_code as string;
        const user_code = authorization.user_code as string;

        poll(app_id, device_code).then((response) => {
          expect(response.status).to.eq(400);
          expect(response.body.error).to.eq("authorization_pending");
        });
        // Polled again at once: too fast.
        poll(app_id, device_code).then((response) => {
          expect(response.status).to.eq(400);
          expect(response.body.error).to.eq("slow_down");
        });

        // Signed out, the verification link goes through the login page and
        // keeps the code.
        cy.logout_via_request();
        cy.visit(`/device?user_code=${user_code}`);
        cy.location("pathname").should("eq", "/auth/login");
        cy.location("search").should("contain", encodeURIComponent(`/device?user_code=${user_code}`));

        signInFreshUser().then((credentials) => {
          cy.visit(`/device?user_code=${user_code.toLowerCase()}`);
          cy.wait_for_page_hydration();
          cy.get('[data-testid="device-authorization-review"]', { timeout: 20000 }).should("be.visible");
          cy.get('[data-testid="device-user-code"]').should("have.text", user_code);
          cy.get('[data-testid="device-app-name"]').should("contain.text", `Device CLI ${app_id}`);
          cy.get('[data-testid="consent-oidc-permissions"]').should("contain.text", "See your email address");
          cy.get('[data-testid="flow-expiry-countdown"]')
            .should("have.attr", "data-expired", "false")
            .find('[role="progressbar"]')
            .should("have.attr", "aria-valuetext");
          cy.get('[data-testid="flow-expiry-countdown-text"]').should("contain.text", "This code expires in");

          cy.get('[data-testid="device-approve-button"]').click();
          cy.get('[data-testid="device-verification-outcome"]').should("have.attr", "data-outcome", "approved");

          poll(app_id, device_code).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.access_token).to.be.a("string");
            expect(response.body.refresh_token).to.be.a("string");
            expect(response.body.id_token).to.be.a("string");
            expect(response.body.scope).to.eq("openid email profile");

            // The refresh token works like any other.
            cy.request<TokenBody>({
              method: "POST",
              url: "/api/oidc/token",
              form: true,
              body: {
                grant_type: "refresh_token",
                client_id: app_id,
                refresh_token: response.body.refresh_token as string,
              },
            }).its("body.access_token").should("be.a", "string");
          });
          // A device code is redeemed once.
          poll(app_id, device_code).then((response) => {
            expect(response.status).to.eq(400);
            expect(response.body.error).to.eq("invalid_grant");
          });

          cy.request(`/api/me/audit-log?event_type=user.device_authorized`).then((response) => {
            const entries: { event_type: string; client_app_id: string | null }[] =
              response.body.data?.entries ?? [];
            expect(entries.some((e) => e.event_type === "user.device_authorized" && e.client_app_id === app_id)).to.be.true;
          });
          cy.wrap(credentials, { log: false });
        });
      });
    });
  });

  it("answers access_denied once the user denies the request", () => {
    createApp().then((app_id) => {
      setDeviceAuthorization(app_id, true);
      requestDeviceAuthorization(app_id).then(({ body: authorization }) => {
        signInFreshUser().then(() => {
          cy.visit(`/device?user_code=${authorization.user_code}`);
          cy.wait_for_page_hydration();
          cy.get('[data-testid="device-deny-button"]', { timeout: 20000 }).click();
          cy.get('[data-testid="device-verification-outcome"]').should("have.attr", "data-outcome", "denied");
          poll(app_id, authorization.device_code as string).then((response) => {
            expect(response.status).to.eq(400);
            expect(response.body.error).to.eq("access_denied");
          });
          // A decided code can no longer be looked up, approved or denied.
          cy.request({
            method: "POST",
            url: "/api/auth/device/approve",
            body: { user_code: authorization.user_code },
            failOnStatusCode: false,
          }).its("status").should("eq", 404);
        });
      });
    });
  });

  it("refuses unknown codes and rate limits guessing", () => {
    signInFreshUser().then(() => {
      cy.visit("/device");
      cy.wait_for_page_hydration();
      // One character per slot of the code input.
      cy.get('[data-testid="device-user-code-entry"] input').each(($slot, index) => {
        cy.wrap($slot).type("bcdfghjk"[index] as string);
      });
      cy.get('[data-testid="device-user-code-error"]').should("contain.text", "not valid");

      const attempts = Array.from({ length: 12 }, (_, i) => i);
      const statuses: number[] = [];
      cy.wrap(attempts).each(() => {
        cy.request({
          method: "POST",
          url: "/api/auth/device/lookup",
          body: { user_code: "ZZZZ-ZZZZ" },
          failOnStatusCode: false,
        }).then((response) => {
          statuses.push(response.status);
        });
      });
      cy.wrap(statuses).should((s: number[]) => {
        expect(s.slice(0, 5).every((status) => status === 404)).to.be.true;
        expect(s[s.length - 1]).to.eq(429);
      });
    });
  });

  it("is not available to the auth server's own app", () => {
    requestDeviceAuthorization(getAuthServerAppIdFromCypressEnv()).then((response) => {
      expect(response.status).to.eq(400);
      expect(response.body.error).to.eq("unauthorized_client");
    });
  });
});
