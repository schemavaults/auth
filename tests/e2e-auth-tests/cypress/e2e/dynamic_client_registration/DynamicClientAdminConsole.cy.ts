// Verifies how the admin console presents a client application registered
// anonymously through OAuth 2.0 dynamic client registration (RFC 7591):
//
//   1. The apps table marks it with a robot (the marker and the
//      registration time under its self-chosen name), so it stands apart
//      from console-created apps, which get no marker.
//   2. Its detail page (/apps/:app_id) shows the RFC 7591 metadata it
//      supplied in a "Dynamic Client Registration" card, defensively:
//      plain http(s) URLs become no-referrer new-tab links, a URL with
//      embedded credentials is shown as text only, bidirectional-override
//      characters are replaced with U+FFFD, and the logo is never loaded.
//      Console-created apps do not get the card.
//
// The registration endpoint is off by default: the spec enables it as the
// superuser and turns it back off afterwards.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

interface RegistrationResponseBody {
  client_id?: string;
  error?: string;
  error_description?: string;
}

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

const SETTING_KEY = "allow_dynamic_client_registration";
const CARD_SELECTOR = '[data-testid="dynamic-client-registration-metadata-card"]';
const ICON_SELECTOR = "[data-dynamic-client-registration-icon]";

const CLIENT_URI = "https://client.example.com/";
const LOGO_URI = "https://client.example.com/logo.png";
const DECEPTIVE_POLICY_URI = "https://client.example.com@evil.example/privacy";
// U+202E RIGHT-TO-LEFT OVERRIDE would display this as "admin@example.com".
const BIDI_CONTACT = "admin\u202Emoc.elpmaxe@";
const SANITIZED_BIDI_CONTACT = "admin\uFFFDmoc.elpmaxe@";

describe("Dynamically registered clients in the admin console", () => {
  let client_id = "";

  /**
   * The superuser login helper asserts that nobody is signed in first, so
   * every superuser step starts from a signed-out state.
   */
  function loginAsSuperuser(): void {
    cy.is_authenticated().then((authenticated: boolean) => {
      if (authenticated) {
        cy.logout();
      }
    });
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
  }

  function setRegistrationEnabled(enabled: boolean): void {
    cy.request({
      method: "PATCH",
      url: `/api/admin/settings/${SETTING_KEY}`,
      body: { value: enabled },
    }).then((response) => {
      expect(response.status, `set ${SETTING_KEY}=${enabled}`).to.equal(200);
    });
  }

  before(() => {
    cy.reset_rate_limit();
    loginAsSuperuser();
    setRegistrationEnabled(true);
    cy.request<RegistrationResponseBody>({
      method: "POST",
      url: "/api/oidc/register",
      body: {
        client_name: "Claude",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_uri: CLIENT_URI,
        logo_uri: LOGO_URI,
        policy_uri: DECEPTIVE_POLICY_URI,
        contacts: ["support@example.com", BIDI_CONTACT],
        software_id: "e2e-mcp-connector",
        software_version: "1.4.2",
        scope: "openid profile",
      },
    }).then((response) => {
      expect(response.status, "registration status").to.equal(201);
      expect(response.body.client_id, "client_id").to.be.a("string");
      client_id = response.body.client_id ?? "";
    });
    cy.logout();
  });

  after(() => {
    loginAsSuperuser();
    setRegistrationEnabled(false);
    cy.logout();
  });

  it("marks the registered client with a robot in the apps table", () => {
    loginAsSuperuser();
    cy.visit("/admin/apps");
    cy.wait_for_page_hydration();

    cy.get('input[placeholder="Filter apps..."]').should("exist").type(client_id);

    cy.get(`[data-dynamically-registered-client]:has(a[href="/apps/${client_id}"])`, {
      timeout: 15000,
    })
      .should("exist")
      .within(() => {
        cy.get(ICON_SELECTOR)
          .should("have.attr", "aria-label", "Dynamically registered client")
          .and("have.attr", "title")
          .and("contain", "dynamic client registration");
        cy.contains("Registered").should("exist");
      });

    // A console-created app keeps its plain name cell.
    const authServerAppId: string = getAuthServerAppIdFromCypressEnv();
    cy.get('input[placeholder="Filter apps..."]').clear().type(authServerAppId);
    cy.get(`a[href="/apps/${authServerAppId}"]`, { timeout: 15000 })
      .first()
      .closest("td")
      .find(ICON_SELECTOR)
      .should("not.exist");
  });

  it("shows the registration metadata on the app page, defensively", () => {
    loginAsSuperuser();
    cy.visit(`/apps/${client_id}`);
    cy.wait_for_page_hydration();

    cy.get(CARD_SELECTOR, { timeout: 15000 })
      .should("exist")
      .within(() => {
        cy.contains("e2e-mcp-connector").should("exist");
        cy.contains("1.4.2").should("exist");
        cy.contains("Public client: PKCE, no client secret").should("exist");
        cy.contains("authorization_code").should("exist");
        cy.contains("refresh_token").should("exist");
        cy.contains("profile").should("exist");
        cy.contains("support@example.com").should("exist");

        cy.get('[data-dynamic-client-metadata-link="client_uri"]')
          .should("have.attr", "href", CLIENT_URI)
          .and("have.attr", "target", "_blank")
          .and("have.attr", "referrerpolicy", "no-referrer")
          .and("have.attr", "rel")
          .and("contain", "noopener");

        // The logo is linked, never loaded.
        cy.get('[data-dynamic-client-metadata-link="logo_uri"]').should(
          "have.attr",
          "href",
          LOGO_URI,
        );
        cy.get("img").should("not.exist");

        // A URL with embedded credentials reads as the wrong host: text only.
        cy.get('[data-dynamic-client-metadata-link="policy_uri"]').should("not.exist");
        cy.contains(DECEPTIVE_POLICY_URI).should("exist");
        cy.contains("Not linked: the URL embeds a username or password").should("exist");

        // Bidirectional overrides cannot reorder the displayed contact.
        cy.contains(SANITIZED_BIDI_CONTACT).should("exist");
      });

  });

  it("does not show the registration card on a console-created app", () => {
    loginAsSuperuser();
    cy.visit(`/apps/${getAuthServerAppIdFromCypressEnv()}`);
    cy.wait_for_page_hydration();
    cy.contains("App ID", { timeout: 15000 }).should("exist");
    cy.get(CARD_SELECTOR).should("not.exist");
    cy.get(ICON_SELECTOR).should("not.exist");
  });
});
