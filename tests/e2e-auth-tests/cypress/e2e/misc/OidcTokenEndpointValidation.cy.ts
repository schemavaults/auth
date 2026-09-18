// Request-shape validation of POST /api/oidc/token that no OIDC spec covered
// (they all send well-formed grants), plus the CORS preflights of the three
// OIDC endpoints that had no coverage at all:
//   POST    /api/oidc/token      -> unsupported_grant_type, non-form body,
//                                   missing code, malformed code_verifier,
//                                   missing client_id, malformed Basic header
//   OPTIONS /api/oidc/token      -> credentialed echo for a registered origin,
//                                   wildcard without an Origin
//   OPTIONS /api/oidc/userinfo, /api/oidc/introspect -> 204 + allowed methods

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface OidcErrorBody {
  error?: string;
  error_description?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function postForm(
  body: Record<string, string>,
  headers: Record<string, string> = {},
): Cypress.Chainable<Cypress.Response<OidcErrorBody>> {
  return cy.request<OidcErrorBody>({
    method: "POST",
    url: "/api/oidc/token",
    form: true,
    body,
    headers: { Accept: "application/json", ...headers },
    failOnStatusCode: false,
  });
}

const WELL_FORMED_CODE = "a".repeat(80);
const WELL_FORMED_VERIFIER = "v".repeat(50);

describe("POST /api/oidc/token request validation", () => {
  it("rejects an unsupported grant_type", () => {
    postForm({ grant_type: "client_credentials", client_id: AUTH_APP_ID }).then(
      (response) => {
        expect(response.status).to.eq(400);
        expect(response.body.error).to.eq("unsupported_grant_type");
      },
    );
  });

  it("rejects a JSON (non form-encoded) body", () => {
    cy.request<OidcErrorBody>({
      method: "POST",
      url: "/api/oidc/token",
      body: { grant_type: "authorization_code", client_id: AUTH_APP_ID },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400);
      expect(response.body.error).to.eq("invalid_request");
    });
  });

  it("rejects a code grant without a code or with a malformed code_verifier", () => {
    postForm({
      grant_type: "authorization_code",
      client_id: AUTH_APP_ID,
      code_verifier: WELL_FORMED_VERIFIER,
    }).then((response) => {
      expect(response.status, "missing code").to.eq(400);
      expect(response.body.error).to.eq("invalid_request");
    });
    postForm({
      grant_type: "authorization_code",
      client_id: AUTH_APP_ID,
      code: WELL_FORMED_CODE,
      code_verifier: "short",
    }).then((response) => {
      expect(response.status, "malformed code_verifier").to.eq(400);
      expect(response.body.error).to.eq("invalid_request");
    });
  });

  it("rejects a request that identifies no client, or carries a malformed Basic header", () => {
    postForm({
      grant_type: "authorization_code",
      code: WELL_FORMED_CODE,
      code_verifier: WELL_FORMED_VERIFIER,
    }).then((response) => {
      expect(response.status, "missing client_id").to.eq(400);
      expect(response.body.error).to.be.a("string");
    });
    postForm(
      {
        grant_type: "authorization_code",
        client_id: AUTH_APP_ID,
        code: WELL_FORMED_CODE,
        code_verifier: WELL_FORMED_VERIFIER,
      },
      { Authorization: "Basic %%%not-base64%%%" },
    ).then((response) => {
      expect(response.status, "malformed Basic header").to.eq(400);
      expect(response.body.error).to.eq("invalid_request");
    });
  });

  it("reports an unredeemable code as invalid_grant", () => {
    postForm({
      grant_type: "authorization_code",
      client_id: AUTH_APP_ID,
      code: WELL_FORMED_CODE,
      code_verifier: WELL_FORMED_VERIFIER,
    }).then((response) => {
      expect(response.status).to.eq(400);
      expect(response.body.error).to.eq("invalid_grant");
    });
  });
});

describe("OIDC endpoint CORS preflights", () => {
  it("OPTIONS /api/oidc/token echoes a registered origin with credentials, and falls back to a wildcard", () => {
    const ownOrigin = new URL(Cypress.config("baseUrl")!).origin;
    cy.request({
      method: "OPTIONS",
      url: "/api/oidc/token",
      headers: { Origin: ownOrigin },
    }).then((response) => {
      expect(response.status).to.eq(204);
      expect(response.headers["access-control-allow-origin"]).to.eq(ownOrigin);
      expect(response.headers["access-control-allow-credentials"]).to.eq("true");
    });
    cy.request({ method: "OPTIONS", url: "/api/oidc/token" }).then((response) => {
      expect(response.status).to.eq(204);
      expect(response.headers["access-control-allow-origin"]).to.eq("*");
      expect(response.headers["access-control-allow-methods"]).to.include("POST");
    });
  });

  it("OPTIONS /api/oidc/userinfo and /api/oidc/introspect answer 204 with their allowed methods", () => {
    cy.request({ method: "OPTIONS", url: "/api/oidc/userinfo" }).then((response) => {
      expect(response.status).to.eq(204);
      expect(response.headers["access-control-allow-origin"]).to.eq("*");
      const methods = String(response.headers["access-control-allow-methods"]);
      expect(methods).to.include("GET");
      expect(methods).to.include("POST");
    });
    cy.request({ method: "OPTIONS", url: "/api/oidc/introspect" }).then((response) => {
      expect(response.status).to.eq(204);
      expect(String(response.headers["access-control-allow-methods"])).to.include("POST");
    });
  });
});
