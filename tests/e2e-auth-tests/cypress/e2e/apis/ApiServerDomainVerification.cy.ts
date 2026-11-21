// Domain ownership verification of API server domains (migration 00057).
// Verified domains take precedence in RFC 8707 resource-URL resolution and,
// once the `require_api_server_domain_verification` server setting is on,
// are the only ones that resolve, so registering someone else's domain gets
// a squatter nothing (dynamic_client_registration/ResourceUrlDomainSquatting.cy.ts
// drives the resolution itself).
//
//   1. A regular user's new API server domain starts unverified: the POST
//      response and GET /api/apis/:id/domains (`verifications`) name the
//      DNS TXT record to publish (`_auth-domain-verification.<host>`).
//   2. Without that record, POST .../verify answers 422
//      `verification_record_not_found` (hosts under the special-use
//      `.invalid` TLD never exist, so no real DNS is involved); a host DNS
//      cannot verify (localhost) answers 422 `domain_not_dns_verifiable`
//      with no TXT record; the administrator attestation is refused (403).
//   3. The /apis table and the API server page badge the domains as
//      unverified, and the page's Verify dialog shows the record and the
//      failed check.
//   4. Another user cannot verify the domain (403).
//   5. The superuser attests the domain (`method: "administrator"`), and
//      it is reported verified.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface DomainVerification {
  api_server_domain_ref_id: string;
  verified: boolean;
  verified_at: number | null;
  verification_method: "dns_txt" | "administrator" | null;
  dns_txt_record: { name: string; value: string } | null;
}

interface AddDomainResponseBody {
  success: boolean;
  message?: string;
  verification?: DomainVerification;
}

interface ListDomainsResponseBody {
  success: boolean;
  list: Array<{ api_server_domain_ref_id: string; domain: string }>;
  verifications: DomainVerification[];
}

interface VerifyResponseBody {
  success: boolean;
  error?: string;
  message: string;
  verification?: DomainVerification;
}

interface WhoamiResponseBody {
  success: boolean;
  user?: { uid: string };
}

// crypto.randomUUID() is unavailable in the spec's browser context (not a
// secure context in CI); the ids feed `z.guid()` validators.
function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function addDomain(
  api_server_id: string,
  api_server_domain_ref_id: string,
  domain: string,
): Cypress.Chainable<Cypress.Response<AddDomainResponseBody>> {
  return cy.request<AddDomainResponseBody>({
    method: "POST",
    url: `/api/apis/${api_server_id}/domains`,
    body: {
      api_server_domain_ref_id,
      api_server_id,
      domain,
      environment: "test",
      created_at: Date.now(),
      hardcoded: false,
    },
  });
}

function verifyDomain(
  api_server_id: string,
  api_server_domain_ref_id: string,
  body?: Record<string, unknown>,
): Cypress.Chainable<Cypress.Response<VerifyResponseBody>> {
  return cy.request<VerifyResponseBody>({
    method: "POST",
    url: `/api/apis/${api_server_id}/domains/${api_server_domain_ref_id}/verify`,
    ...(body ? { body } : {}),
    failOnStatusCode: false,
  });
}

function listVerifications(api_server_id: string): Cypress.Chainable<DomainVerification[]> {
  return cy
    .request<ListDomainsResponseBody>({ method: "GET", url: `/api/apis/${api_server_id}/domains` })
    .then((response) => {
      expect(response.status, "list domains status").to.eq(200);
      return response.body.verifications;
    });
}

describe("API server domain ownership verification", () => {
  beforeEach(() => {
    cy.reset_rate_limit();
  });

  it("keeps a new domain unverified until its owner proves control, and lets an administrator attest it", () => {
    cy.generate_random_test_user_credentials().then((otherCredentials) => {
      cy.create_and_login_as_regular_user_via_request(otherCredentials).then((created: boolean) => {
        expect(created, "other user creation should succeed").to.be.true;
      });
      cy.logout();

      cy.generate_random_test_user_credentials().then((ownerCredentials) => {
        cy.create_and_login_as_regular_user_via_request(ownerCredentials).then((created: boolean) => {
          expect(created, "owner user creation should succeed").to.be.true;
        });

        cy.request<WhoamiResponseBody>({ method: "GET", url: `/api/auth/whoami/${AUTH_APP_ID}` }).then((whoami) => {
          const owner_uid = whoami.body.user?.uid;
          if (typeof owner_uid !== "string") throw new Error("Expected whoami to return the owner's uid");

          cy.generate_random_code(10).then((randomCode: string) => {
            const lowerCode = randomCode.toLowerCase();
            const api_server_id: string = generateV4Uuid();
            const dnsRef: string = generateV4Uuid();
            const localhostRef: string = generateV4Uuid();
            const dnsHost = `api-${lowerCode}.domain-verification.invalid`;
            const dnsDomain = `https://${dnsHost}`;

            cy.request({
              method: "POST",
              url: "/api/apis",
              body: {
                api_server_id,
                api_server_name: `Domain Verification API ${randomCode}`,
                api_server_description: `API server for the domain verification E2E test ${randomCode}`,
                created_at: Date.now(),
                public: false,
                hardcoded: false,
                owner_type: "user",
                owner_uid,
              },
            }).then((response) => {
              expect(response.status, "API server creation").to.eq(200);
            });

            // 1. A new domain is pending, with the TXT record to publish.
            addDomain(api_server_id, dnsRef, dnsDomain).then((response) => {
              expect(response.status, "add domain").to.eq(200);
              const verification = response.body.verification;
              expect(verification?.api_server_domain_ref_id).to.eq(dnsRef);
              expect(verification?.verified, "new domain verified").to.eq(false);
              expect(verification?.verified_at).to.eq(null);
              expect(verification?.dns_txt_record?.name).to.eq(`_auth-domain-verification.${dnsHost}`);
              expect(verification?.dns_txt_record?.value).to.match(/^auth-domain-verification=[0-9a-f]{32}$/);
            });
            addDomain(api_server_id, localhostRef, "http://localhost:4321").then((response) => {
              expect(response.status, "add localhost domain").to.eq(200);
              expect(response.body.verification?.dns_txt_record, "localhost TXT record").to.eq(null);
            });
            listVerifications(api_server_id).then((verifications) => {
              const byRef = new Map(verifications.map((v) => [v.api_server_domain_ref_id, v]));
              expect(byRef.get(dnsRef)?.verified, "listed DNS domain verified").to.eq(false);
              expect(byRef.get(dnsRef)?.dns_txt_record?.name).to.eq(`_auth-domain-verification.${dnsHost}`);
              expect(byRef.get(localhostRef)?.verified, "listed localhost domain verified").to.eq(false);
            });

            // 2. Without the record (or DNS support), nothing gets verified.
            verifyDomain(api_server_id, dnsRef).then((response) => {
              expect(response.status, "verify without the record").to.eq(422);
              expect(response.body.error).to.eq("verification_record_not_found");
              expect(response.body.verification?.verified).to.eq(false);
            });
            verifyDomain(api_server_id, localhostRef, { method: "dns_txt" }).then((response) => {
              expect(response.status, "verify a localhost domain").to.eq(422);
              expect(response.body.error).to.eq("domain_not_dns_verifiable");
            });
            verifyDomain(api_server_id, dnsRef, { method: "administrator" }).then((response) => {
              expect(response.status, "non-admin attestation").to.eq(403);
            });
            verifyDomain(api_server_id, generateV4Uuid()).then((response) => {
              expect(response.status, "unknown domain").to.eq(404);
            });

            // 3. The /apis table and the API server page badge the pending
            //    domains, and the page shows how to verify one. (The table's
            //    Domains column can sit outside its scroll area at narrow
            //    viewports, and the domain rows near the page's fold, so
            //    each badge is scrolled into view before it is checked.)
            cy.visit("/apis");
            cy.wait_for_page_hydration();
            cy.get(`[data-testid="api-server-domain-unverified-${dnsRef}"]`).scrollIntoView().should("be.visible");
            cy.get(`[data-testid="api-server-domain-unverified-${localhostRef}"]`).scrollIntoView().should("be.visible");
            cy.visit(`/apis/${api_server_id}`);
            cy.wait_for_page_hydration();
            cy.get(`[data-testid="api-server-domain-unverified-${dnsRef}"]`).scrollIntoView().should("be.visible");
            cy.get(`button#verify-api-server-domain-button-${dnsRef}`).click();
            cy.get("#verify-api-server-domain-dialog-content").within(() => {
              cy.get('[data-testid="api-server-domain-txt-record-name"]').should(
                "have.text",
                `_auth-domain-verification.${dnsHost}`,
              );
              cy.get('[data-testid="api-server-domain-txt-record-value"]')
                .invoke("text")
                .should("match", /^auth-domain-verification=[0-9a-f]{32}$/);
              cy.get("button#attest-api-server-domain-button").should("not.exist");
              cy.get("button#check-api-server-domain-dns-button").click();
              cy.get('[data-testid="verify-api-server-domain-problem"]').should("contain.text", "No TXT record");
            });

            // 4. Another user cannot verify it.
            cy.logout();
            cy.login_via_request(otherCredentials.email, otherCredentials.password).then((ok: boolean) => {
              expect(ok, "other user login").to.be.true;
            });
            verifyDomain(api_server_id, dnsRef).then((response) => {
              expect(response.status, "verify by a non-manager").to.eq(403);
            });
            cy.logout();

            // 5. A platform administrator attests it.
            cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
              expect(ok, "superuser login").to.be.true;
            });
            verifyDomain(api_server_id, localhostRef, { method: "administrator" }).then((response) => {
              expect(response.status, "administrator attestation").to.eq(200);
              expect(response.body.success).to.eq(true);
              expect(response.body.verification?.verified).to.eq(true);
              expect(response.body.verification?.verification_method).to.eq("administrator");
              expect(response.body.verification?.verified_at).to.be.a("number");
            });
            listVerifications(api_server_id).then((verifications) => {
              const byRef = new Map(verifications.map((v) => [v.api_server_domain_ref_id, v]));
              expect(byRef.get(localhostRef)?.verified, "attested domain verified").to.eq(true);
              expect(byRef.get(dnsRef)?.verified, "other domain still pending").to.eq(false);
            });
            cy.visit(`/apis/${api_server_id}`);
            cy.wait_for_page_hydration();
            cy.get(`[data-testid="api-server-domain-verified-${localhostRef}"]`).scrollIntoView().should("be.visible");
            cy.get(`button#verify-api-server-domain-button-${localhostRef}`).should("not.exist");

            cy.request({ method: "DELETE", url: `/api/apis/${api_server_id}` }).then((response) => {
              expect(response.status, "cleanup").to.eq(200);
            });
            cy.logout();
          });
        });
      });
    });
  });
});
