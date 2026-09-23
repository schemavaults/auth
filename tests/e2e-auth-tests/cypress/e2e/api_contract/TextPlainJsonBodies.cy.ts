// Several first-party callers (`@schemavaults/auth-ui` forms, a few client
// SDK methods) JSON.stringify their request body WITHOUT setting a
// Content-Type header, so browsers send `text/plain;charset=UTF-8`. The
// auth server has always parsed such bodies as JSON; this spec pins that
// contract for the JSON-body management endpoints those callers use, so a
// stricter body parser cannot silently break them.
//   POST /api/organizations        (CreateOrganizationForm)
//   POST /api/admin/invite-codes   (CreateInviteCodeForm)
//   POST /api/apps                 (client SDK createClientApplication)

interface Envelope {
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function postTextPlainJson(
  url: string,
  body: Record<string, unknown>,
): Cypress.Chainable<Cypress.Response<Envelope>> {
  return cy.request<Envelope>({
    method: "POST",
    url,
    body: JSON.stringify(body),
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    failOnStatusCode: false,
  });
}

function suffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

describe("JSON bodies sent as text/plain", () => {
  beforeEach(() => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) =>
      expect(ok, "superuser login").to.be.true,
    );
  });

  it("POST /api/organizations accepts a text/plain JSON body", () => {
    const organization_id = `tp-org-${suffix()}`;
    postTextPlainJson("/api/organizations", {
      organization_id,
      name: `Text plain org ${organization_id}`,
      created_at: Date.now(),
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      cy.delete_organization({ organization_id });
    });
  });

  it("POST /api/admin/invite-codes accepts a text/plain JSON body", () => {
    const invite_code = `tp-invite-${suffix()}`;
    postTextPlainJson("/api/admin/invite-codes", {
      invite_code,
      created_at: Date.now(),
      max_uses: 1,
    }).then((response) => {
      expect(response.status, JSON.stringify(response.body)).to.eq(200);
      expect(response.body.success).to.eq(true);
    });
  });

  it("POST /api/apps accepts a text/plain JSON body", () => {
    const app_id = `tp-app-${suffix()}`;
    postTextPlainJson("/api/apps", {
      app_id,
      app_name: `Text plain app ${app_id}`,
      app_description: "TextPlainJsonBodies.cy.ts",
      created_at: Date.now(),
      public: true,
      hardcoded: false,
      web: true,
    }).then((response) => {
      expect(response.status, JSON.stringify(response.body)).to.eq(200);
      expect(response.body.success).to.eq(true);
      cy.request({ method: "DELETE", url: `/api/apps/${app_id}` })
        .its("status")
        .should("eq", 200);
    });
  });

  it("a malformed JSON body is a 400 envelope, not a 500", () => {
    cy.request<Envelope>({
      method: "POST",
      url: "/api/organizations",
      body: "{ not json",
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400);
      expect(response.body.success).to.eq(false);
      expect(response.body.message).to.be.a("string");
    });
  });
});
