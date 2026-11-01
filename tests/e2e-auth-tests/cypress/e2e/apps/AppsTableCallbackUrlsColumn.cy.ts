// Pins the "Callback URLs" column of the apps table (`AppCallbackUrlsList`
// in @schemavaults/auth-ui's AppsTable): each row loads its app's callback
// URLs on its own and lists them with their environment, the deployment's
// environment first; an app without any reads "No callback URLs".
//
// A fresh regular user owns the only apps on their /apps page, so the rows
// are there without paging or filtering.

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

const ENVIRONMENT: string = Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test";
const OTHER_ENVIRONMENT: string = ENVIRONMENT === "production" ? "staging" : "production";
const ORIGIN = "https://cb-column.example";
const CURRENT_CALLBACK_URL = `${ORIGIN}/auth/callback`;
const OTHER_CALLBACK_URL = `${ORIGIN}/other-environment/callback`;

function appBody(app_id: string, app_name: string, extra: Record<string, unknown> = {}) {
  return {
    app_id,
    app_name,
    app_description: "AppsTableCallbackUrlsColumn.cy.ts",
    created_at: Date.now(),
    public: false,
    hardcoded: false,
    web: true,
    owner_type: "user",
    ...extra,
  };
}

describe("Apps table: Callback URLs column", () => {
  it("lists each app's callback URLs with their environment", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then((ok: boolean) => {
        expect(ok, "regular user registration + login").to.be.true;
      });

      cy.generate_random_code(8).then((randomCode: string) => {
        const code = randomCode.toLowerCase();
        const withName = `Callback Column With ${code}`;
        const noneName = `Callback Column None ${code}`;

        cy.request({
          method: "POST",
          url: "/api/apps",
          body: appBody(`cb-col-with-${code}`, withName, {
            initial_domains: [{ domain: ORIGIN, environment: ENVIRONMENT }],
            // Registered other environment first: the cell still lists the
            // deployment's own environment first.
            initial_callback_urls: [
              { callback_url: OTHER_CALLBACK_URL, environment: OTHER_ENVIRONMENT },
              { callback_url: CURRENT_CALLBACK_URL, environment: ENVIRONMENT },
            ],
          }),
        })
          .its("status")
          .should("eq", 200);
        cy.request({
          method: "POST",
          url: "/api/apps",
          body: appBody(`cb-col-none-${code}`, noneName, {
            initial_domains: [{ domain: ORIGIN, environment: ENVIRONMENT }],
          }),
        })
          .its("status")
          .should("eq", 200);

        cy.visit("/apps");
        cy.wait_for_page_hydration();
        // The table scrolls horizontally on narrow viewports.
        cy.contains("th", "Callback URLs").scrollIntoView().should("be.visible");

        // Domains and callback URLs both render list items and load on
        // their own, so retry until both callback URLs are listed.
        cy.contains("tr", withName, { timeout: 20000 })
          .find("li", { timeout: 20000 })
          .should(($items) => {
            const texts: string[] = [...$items].map((item) => item.textContent ?? "");
            const callbackItems = texts.filter((text) => text.includes("/callback"));
            expect(callbackItems, "callback URL rows").to.have.length(2);
            expect(callbackItems[0], "current environment first").to.include(CURRENT_CALLBACK_URL);
            expect(callbackItems[0]).to.include(ENVIRONMENT);
            expect(callbackItems[1]).to.include(OTHER_CALLBACK_URL);
            expect(callbackItems[1]).to.include(OTHER_ENVIRONMENT);
          });

        cy.contains("tr", noneName, { timeout: 20000 }).should(
          "contain.text",
          "No callback URLs",
        );
      });
    });
  });
});
