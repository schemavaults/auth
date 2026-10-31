// Pins the optional "Domains and callback URLs" section of the create app
// dialog (`InitialRedirectTargetsFields` in @schemavaults/auth-ui):
//   - it warns while no callback URL is entered, and the warning goes away
//     once one is;
//   - it offers to add a callback URL's origin as a domain;
//   - an invalid row is reported inline and sends no request;
//   - the domains and callback URLs travel in the POST /api/apps body
//     (`initial_domains` / `initial_callback_urls`, for the environment
//     picked in the section) and are registered with the new app.

interface CreateAppRequestBody {
  app_id?: string;
  initial_domains?: Array<{ domain: string; environment: string }>;
  initial_callback_urls?: Array<{ callback_url: string; environment: string }>;
}

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

const OPEN_BUTTON_ID = "open-create-app-dialog-button";
const DIALOG_CONTENT_ID = "create-app-dialog-content";
const SUBMIT_BUTTON_ID = "submit-create-app-form-button";
const WARNING_ID = "create-app-missing-callback-url-warning";
const DOMAIN_INPUT_0 = "create-app-domain-input-0";
const CALLBACK_URL_INPUT_0 = "create-app-callback-url-input-0";

const ENVIRONMENT: string = Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test";
const ORIGIN = "https://create-dialog-targets.example";
const CALLBACK_URL = `${ORIGIN}/auth/callback`;

/** See CreateAppOwnerField.cy.ts: the SDK sends JSON bodies as text/plain. */
function parseInterceptedBody(body: unknown): CreateAppRequestBody {
  return (typeof body === "string" ? JSON.parse(body) : body) as CreateAppRequestBody;
}

function openCreateAppDialog(): void {
  cy.visit("/admin/apps");
  cy.wait_for_page_hydration();
  cy.open_dialog_with_button(OPEN_BUTTON_ID, DIALOG_CONTENT_ID);
}

function fillAppName(app_name: string): void {
  cy.get(`input[name="app_name"]`).should("not.be.disabled").clear().type(app_name);
  cy.get(`textarea[name="app_description"]`)
    .should("not.be.disabled")
    .clear()
    .type(`${app_name} (redirect targets E2E test)`);
}

describe("Create app dialog: domains and callback URLs", () => {
  beforeEach(() => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      expect(ok, "superuser login").to.be.true;
    });
  });

  it("warns without a callback URL and registers the entered ones with the app", () => {
    cy.generate_random_code(10).then((code: string) => {
      openCreateAppDialog();
      fillAppName(`Redirect Targets App ${code}`);

      // The section preselects the deployment's environment and warns
      // while no callback URL is entered.
      cy.get(`#create-app-redirect-environment-${ENVIRONMENT}`).should(
        "have.attr",
        "data-state",
        "checked",
      );
      cy.get(`#${WARNING_ID}`)
        .should("be.visible")
        .and("contain.text", "Not having a callback URL is dangerous");

      // Entering a callback URL clears the warning and offers its origin
      // as a domain.
      cy.get(`#${CALLBACK_URL_INPUT_0}`).type(CALLBACK_URL);
      cy.get(`#${WARNING_ID}`).should("not.exist");
      cy.get(`#${DIALOG_CONTENT_ID}`).contains("button", ORIGIN).click();
      cy.get(`#${DOMAIN_INPUT_0}`).should("have.value", ORIGIN);

      cy.intercept({ method: "POST", url: "**/api/apps", times: 1 }).as("createAppRequest");
      cy.get(`button#${SUBMIT_BUTTON_ID}`).should("not.be.disabled").click();
      cy.wait("@createAppRequest", { timeout: 20000, requestTimeout: 20000 }).then(
        (interception) => {
          expect(interception.response?.statusCode, "create app status").to.eq(200);
          const body = parseInterceptedBody(interception.request.body);
          expect(body.initial_domains).to.deep.eq([{ domain: ORIGIN, environment: ENVIRONMENT }]);
          expect(body.initial_callback_urls).to.deep.eq([
            { callback_url: CALLBACK_URL, environment: ENVIRONMENT },
          ]);
          const app_id = body.app_id as string;
          cy.get(`#${DIALOG_CONTENT_ID}`).should("not.exist");

          cy.request<{ list: Array<{ callback_url: string; environment: string }> }>({
            method: "GET",
            url: `/api/apps/${app_id}/callback-urls`,
          }).then((response) => {
            expect(
              response.body.list.map(({ callback_url, environment }) => ({ callback_url, environment })),
            ).to.deep.eq([{ callback_url: CALLBACK_URL, environment: ENVIRONMENT }]);
          });
          cy.request<{ list: Array<{ domain: string }> }>({
            method: "GET",
            url: `/api/apps/${app_id}/domains`,
          }).then((response) => {
            expect(response.body.list.map((d) => d.domain)).to.deep.eq([ORIGIN]);
          });

          cy.request({ method: "DELETE", url: `/api/apps/${app_id}` }).its("status").should("eq", 200);
        },
      );
    });
  });

  it("reports an invalid row inline and sends nothing", () => {
    cy.generate_random_code(10).then((code: string) => {
      openCreateAppDialog();
      fillAppName(`Invalid Redirect Targets App ${code}`);

      cy.intercept({ method: "POST", url: "**/api/apps" }).as("createAppRequest");
      cy.get(`#${DOMAIN_INPUT_0}`).type(`${ORIGIN}/not/an/origin`);
      cy.get(`#${CALLBACK_URL_INPUT_0}`).type(`${CALLBACK_URL}#fragment`);
      cy.get(`button#${SUBMIT_BUTTON_ID}`).should("not.be.disabled").click();

      cy.get(`#${DOMAIN_INPUT_0}`).should("have.attr", "aria-invalid", "true");
      cy.get(`#${CALLBACK_URL_INPUT_0}`).should("have.attr", "aria-invalid", "true");
      cy.get(`#${DIALOG_CONTENT_ID}`)
        .should("contain.text", "must not include a fragment")
        .and("contain.text", "Domains must be an http(s) origin");
      cy.get(`#${DIALOG_CONTENT_ID}`).should("be.visible");
      cy.get("@createAppRequest.all").should("have.length", 0);
    });
  });
});
