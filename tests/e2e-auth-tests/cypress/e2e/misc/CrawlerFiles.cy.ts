// Covers GET /robots.txt and GET /sitemap.xml (auth-server/src/app/robots.ts
// and sitemap.ts). The suite runs the auth server in the test environment,
// whose robots.txt keeps every crawler out; production's allow / disallow
// rules and its Sitemap line are pinned by the unit tests in
// auth-server/src/lib/seo/. The sitemap is served in every environment, as
// absolute URLs on the deployment's own URL (the discovery `issuer`).

const PUBLIC_PAGE_PATHS = ["/", "/auth/login", "/auth/register", "/help", "/docs"];

function sitemapLocations(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
}

describe("Crawler files", () => {
  beforeEach(() => {
    cy.clearCookies();
  });

  it("serves a robots.txt that keeps crawlers out of a non-production deployment", () => {
    cy.request<string>({ method: "GET", url: "/robots.txt" }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.headers["content-type"]).to.include("text/plain");
      expect(response.body).to.match(/^User-Agent: \*\nDisallow: \/\n/);
      expect(response.body).not.to.include("Sitemap:");
    });
  });

  it("serves a sitemap.xml of the public pages and every API reference page, on the auth server's URL", () => {
    cy.request<{ issuer: string }>("/.well-known/openid-configuration").then(({ body: { issuer } }) => {
      cy.request<string>({ method: "GET", url: "/sitemap.xml" }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.headers["content-type"]).to.include("application/xml");

        const locations: string[] = sitemapLocations(response.body);
        expect(locations.slice(0, PUBLIC_PAGE_PATHS.length)).to.deep.equal(
          PUBLIC_PAGE_PATHS.map((path) => new URL(path, issuer).toString()),
        );
        const docsLocations: string[] = locations.slice(PUBLIC_PAGE_PATHS.length);
        expect(docsLocations.length, "API reference pages").to.be.greaterThan(0);
        const docsPrefix: string = new URL("/docs/", issuer).toString();
        for (const location of docsLocations) {
          expect(location).to.match(new RegExp(`^${Cypress._.escapeRegExp(docsPrefix)}[a-z0-9_.~-]+$`));
        }

        // Every listed page is served.
        for (const location of [...locations.slice(0, PUBLIC_PAGE_PATHS.length), docsLocations[0]]) {
          cy.request({ method: "GET", url: new URL(location).pathname })
            .its("status")
            .should("eq", 200);
        }
      });
    });
  });
});
