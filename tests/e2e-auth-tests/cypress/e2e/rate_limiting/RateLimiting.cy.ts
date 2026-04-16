// Verifies that the auth-server's Redis-backed rate limiting actually applies
// to each of the public auth endpoints. Each test resets the rate limit state
// before it runs, uses invalid-but-well-formed request bodies (since the rate
// limit check happens before full schema validation), and asserts that the
// Nth+1 request returns HTTP 429 with the expected headers.

describe("Rate Limiting", () => {
  beforeEach(() => {
    cy.reset_rate_limit();
  });

  function expectRateLimitedResponse(
    response: Cypress.Response<unknown>,
    expectedLimit: number,
  ): void {
    expect(response.status, "rate-limited response status").to.eq(429);
    expect(
      response.headers["retry-after"],
      "Retry-After header on 429",
    ).to.exist;
    expect(
      response.headers["x-ratelimit-limit"],
      "X-RateLimit-Limit header on 429",
    ).to.eq(String(expectedLimit));
    expect(
      response.headers["x-ratelimit-remaining"],
      "X-RateLimit-Remaining header on 429",
    ).to.eq("0");
  }

  describe("POST /api/auth/register (3/hour per IP)", () => {
    it("returns 429 after 3 requests in the window", () => {
      for (let i = 1; i <= 3; i++) {
        cy.request({
          method: "POST",
          url: "/api/auth/register",
          body: {},
          failOnStatusCode: false,
        }).then((response) => {
          expect(
            response.status,
            `request ${i} should not be rate-limited`,
          ).to.not.eq(429);
        });
      }

      cy.request({
        method: "POST",
        url: "/api/auth/register",
        body: {},
        failOnStatusCode: false,
      }).then((response) => {
        expectRateLimitedResponse(response, 3);
      });
    });
  });

  describe("POST /api/auth/reset-password/confirm (5/15min per IP)", () => {
    it("returns 429 after 5 requests in the window", () => {
      for (let i = 1; i <= 5; i++) {
        cy.request({
          method: "POST",
          url: "/api/auth/reset-password/confirm",
          body: {},
          failOnStatusCode: false,
        }).then((response) => {
          expect(
            response.status,
            `request ${i} should not be rate-limited`,
          ).to.not.eq(429);
        });
      }

      cy.request({
        method: "POST",
        url: "/api/auth/reset-password/confirm",
        body: {},
        failOnStatusCode: false,
      }).then((response) => {
        expectRateLimitedResponse(response, 5);
      });
    });
  });

  describe("POST /api/auth/reset-password/request (3/hour per email)", () => {
    it("returns 429 after 3 requests for the same email", () => {
      const body = { email: "rate-limit-reset-pwd-request@example.com" };

      for (let i = 1; i <= 3; i++) {
        cy.request({
          method: "POST",
          url: "/api/auth/reset-password/request",
          body,
          failOnStatusCode: false,
        }).then((response) => {
          expect(
            response.status,
            `request ${i} should not be rate-limited`,
          ).to.not.eq(429);
        });
      }

      cy.request({
        method: "POST",
        url: "/api/auth/reset-password/request",
        body,
        failOnStatusCode: false,
      }).then((response) => {
        expectRateLimitedResponse(response, 3);
      });
    });

    it("tracks the limit per email, not across emails", () => {
      // Exhaust the limit for email A
      const emailA = { email: "rate-limit-reset-a@example.com" };
      for (let i = 1; i <= 3; i++) {
        cy.request({
          method: "POST",
          url: "/api/auth/reset-password/request",
          body: emailA,
          failOnStatusCode: false,
        });
      }
      cy.request({
        method: "POST",
        url: "/api/auth/reset-password/request",
        body: emailA,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "email A exhausted -> 429").to.eq(429);
      });

      // A different email should still be allowed
      cy.request({
        method: "POST",
        url: "/api/auth/reset-password/request",
        body: { email: "rate-limit-reset-b@example.com" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "email B should not be rate-limited").to.not.eq(
          429,
        );
      });
    });
  });

  describe("POST /api/auth/login (5/15min per IP+email)", () => {
    it("returns 429 after 5 requests for the same email", () => {
      const body = {
        credentials: {
          email: "rate-limit-login@example.com",
          password: "not-a-real-password",
        },
      };

      for (let i = 1; i <= 5; i++) {
        cy.request({
          method: "POST",
          url: "/api/auth/login",
          body,
          failOnStatusCode: false,
        }).then((response) => {
          expect(
            response.status,
            `request ${i} should not be rate-limited`,
          ).to.not.eq(429);
        });
      }

      cy.request({
        method: "POST",
        url: "/api/auth/login",
        body,
        failOnStatusCode: false,
      }).then((response) => {
        expectRateLimitedResponse(response, 5);
      });
    });
  });

  describe("POST /api/auth/token/refresh_token/:client_app_id (30/min per IP)", () => {
    // Use a well-formed UUID so we get past the URL client_app_id validation
    // and actually hit the rate limit check.
    const fakeAppId = "00000000-0000-0000-0000-000000000001";

    it("returns 429 after 30 requests in the window", () => {
      for (let i = 1; i <= 30; i++) {
        cy.request({
          method: "POST",
          url: `/api/auth/token/refresh_token/${fakeAppId}`,
          body: {},
          failOnStatusCode: false,
        }).then((response) => {
          expect(
            response.status,
            `request ${i} should not be rate-limited`,
          ).to.not.eq(429);
        });
      }

      cy.request({
        method: "POST",
        url: `/api/auth/token/refresh_token/${fakeAppId}`,
        body: {},
        failOnStatusCode: false,
      }).then((response) => {
        expectRateLimitedResponse(response, 30);
      });
    });
  });

  describe("Headers on non-rate-limited responses", () => {
    it("includes a 429 Retry-After header on the rate-limited response", () => {
      for (let i = 1; i <= 3; i++) {
        cy.request({
          method: "POST",
          url: "/api/auth/register",
          body: {},
          failOnStatusCode: false,
        });
      }
      cy.request({
        method: "POST",
        url: "/api/auth/register",
        body: {},
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(429);
        const retryAfter = Number(response.headers["retry-after"]);
        expect(retryAfter, "Retry-After should be a positive integer").to.be.a(
          "number",
        );
        expect(retryAfter).to.be.greaterThan(0);
        // 3/hour -> window = 3600s, so Retry-After must not exceed that
        expect(retryAfter).to.be.lessThan(3601);
      });
    });
  });

  describe("POST /api/test/reset-rate-limit", () => {
    it("clears rate-limit counters so the endpoint is usable again", () => {
      // Exhaust the register limit
      for (let i = 1; i <= 3; i++) {
        cy.request({
          method: "POST",
          url: "/api/auth/register",
          body: {},
          failOnStatusCode: false,
        });
      }
      cy.request({
        method: "POST",
        url: "/api/auth/register",
        body: {},
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "should be exhausted before reset").to.eq(429);
      });

      // Reset
      cy.reset_rate_limit();

      // Should be usable again
      cy.request({
        method: "POST",
        url: "/api/auth/register",
        body: {},
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "should not be rate-limited after reset").to.not.eq(
          429,
        );
      });
    });
  });
});
