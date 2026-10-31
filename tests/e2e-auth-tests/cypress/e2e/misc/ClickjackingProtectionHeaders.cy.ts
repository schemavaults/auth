// Pins the auth server's clickjacking protection: every response forbids
// framing by any origin with `Content-Security-Policy: frame-ancestors 'none'`
// plus the legacy `X-Frame-Options: DENY`. The headers come from the
// `headers()` rules of auth-server/next.config.ts, built by
// auth-server/src/lib/security-headers/frame-protection.ts. /branding/*
// route handlers send their own stricter CSP, which must keep the
// frame-ancestors directive.
//
// cy.request() reads the server's raw response headers. Cypress strips both
// headers from pages it loads with cy.visit(), so they do not block the suite.

const FRAME_ANCESTORS_NONE = "frame-ancestors 'none'";

function expectFramingForbidden(
  response: Cypress.Response<unknown>,
  url: string,
): void {
  // Duplicate headers would be joined into one comma-separated value, so an
  // exact match also proves a single CSP header was sent.
  expect(response.headers["content-security-policy"], `${url} CSP`).to.eq(
    FRAME_ANCESTORS_NONE,
  );
  expect(response.headers["x-frame-options"], `${url} X-Frame-Options`).to.eq(
    "DENY",
  );
}

function requestAndExpectFramingForbidden(
  url: string,
  expectedStatus: number,
): void {
  cy.request({
    method: "GET",
    url,
    followRedirect: false,
    failOnStatusCode: false,
  }).then((response) => {
    expect(response.status, `${url} status`).to.eq(expectedStatus);
    expectFramingForbidden(response, url);
  });
}

describe("Clickjacking protection headers", () => {
  beforeEach(() => {
    cy.clearCookies();
  });

  it("forbids framing of the public pages, the API, the docs and the 404 page", () => {
    requestAndExpectFramingForbidden("/", 200);
    requestAndExpectFramingForbidden("/auth/login", 200);
    requestAndExpectFramingForbidden("/auth/register", 200);
    requestAndExpectFramingForbidden("/docs", 200);
    requestAndExpectFramingForbidden("/api/openapi.json", 200);
    requestAndExpectFramingForbidden("/.well-known/openid-configuration", 200);
    requestAndExpectFramingForbidden("/this-page-does-not-exist", 404);
  });

  it("forbids framing of the redirect that sends a signed-out visitor to sign in", () => {
    cy.request({
      method: "GET",
      url: "/account/connected-apps",
      followRedirect: false,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.be.within(300, 399);
      expectFramingForbidden(response, "/account/connected-apps");
    });
  });

  it("forbids framing of signed-in pages: third-party access and the admin pages", () => {
    cy.create_and_login_as_superuser_via_request().then((loggedIn: boolean) => {
      expect(loggedIn, "superuser login should succeed").to.be.true;
      requestAndExpectFramingForbidden("/account/connected-apps", 200);
      requestAndExpectFramingForbidden("/admin", 200);
      requestAndExpectFramingForbidden("/admin/users", 200);
    });
  });

  it("keeps the branding assets' own sandbox CSP, with framing forbidden", () => {
    cy.request({ method: "GET", url: "/branding/favicon" }).then((response) => {
      expect(response.status).to.eq(200);
      const csp: string = String(response.headers["content-security-policy"]);
      const directives: string[] = csp.split(";").map((d) => d.trim());
      expect(directives).to.include("default-src 'none'");
      expect(directives).to.include("sandbox");
      expect(directives).to.include(FRAME_ANCESTORS_NONE);
      expect(response.headers["x-frame-options"]).to.eq("DENY");
    });
  });
});
