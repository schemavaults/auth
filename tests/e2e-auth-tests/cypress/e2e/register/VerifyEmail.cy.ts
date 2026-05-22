describe("Verify Email", () => {
  it("can load the verify email page", () => {
    cy.visit("/auth/verify-email");
    cy.url().should("include", "/auth/verify-email");
    cy.contains("Verify your").should("be.visible");
    cy.get("input[name='email']").should("exist").should("be.visible");
  });

  it("has a 'Sign in' link on the verify email page to go back to login", () => {
    cy.visit("/auth/verify-email");
    cy.wait_for_page_hydration();
    cy.contains("Sign in")
      .should("exist")
      .should("have.attr", "href")
      .and("include", "/auth/login");
  });

  it("can submit the request verify form and see a success toast", () => {
    cy.visit("/auth/verify-email");
    cy.wait_for_page_hydration();

    cy.intercept({
      method: "POST",
      url: "**/api/auth/verify-email/request",
      times: 1,
    }).as("verifyRequest");

    cy.get("input[name='email']").type("nonexistent@example.com", {
      force: true,
    });
    cy.get("button[type='submit']").click();

    cy.wait("@verifyRequest", { timeout: 15000 }).then((interception) => {
      // Should always return 200 regardless of whether user exists (prevents email enumeration)
      expect(interception.response?.statusCode).to.equal(200);
    });

    // Should show a success toast
    cy.contains("Check your email").should("be.visible");
  });

  it("can verify a user's email via token", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      // Step 1: Create a user to verify the email of
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success, "create_and_login_as_regular_user should succeed").to.be.true;
        cy.logout();

        // Step 2: Get an email verification token via the test-only endpoint
        cy.request({
          method: "GET",
          url: `/api/test/email-verification-token/${encodeURIComponent(credentials.email)}`,
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.equal(200);
          expect(response.body.success, "Email verification token endpoint should return success").to.be.true;
          expect(response.body.token).to.be.a("string");

          const token: string = response.body.token;

          // Step 3: Confirm via the API directly
          cy.request({
            method: "POST",
            url: "/api/auth/verify-email/confirm",
            body: { token },
            failOnStatusCode: false,
          }).then((confirmResponse) => {
            expect(confirmResponse.status).to.equal(200);
            expect(confirmResponse.body.success).to.be.true;
          });
        });
      });
    });
  });

  it("shows a success state when visiting the verify-email page with a valid token", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success, "create_and_login_as_regular_user should succeed").to.be.true;
        cy.logout();

        cy.request({
          method: "GET",
          url: `/api/test/email-verification-token/${encodeURIComponent(credentials.email)}`,
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.equal(200);
          const token: string = response.body.token;

          cy.intercept({
            method: "POST",
            url: "**/api/auth/verify-email/confirm",
            times: 1,
          }).as("confirmVerify");

          cy.visit(`/auth/verify-email?token=${token}`);

          cy.wait("@confirmVerify", { timeout: 15000 }).then((interception) => {
            expect(interception.response?.statusCode).to.equal(200);
          });

          cy.contains("Your email has been verified").should("be.visible");
          cy.contains("Continue to your account")
            .should("exist")
            .should("have.attr", "href")
            .and("include", "/account");
        });
      });
    });
  });

  it("rejects an invalid/expired verification token", () => {
    cy.intercept({
      method: "POST",
      url: "**/api/auth/verify-email/confirm",
      times: 1,
    }).as("confirmVerify");

    cy.visit(`/auth/verify-email?token=00000000-0000-0000-0000-000000000000`);

    cy.wait("@confirmVerify", { timeout: 15000 }).then((interception) => {
      expect(interception.response?.statusCode).to.equal(400);
    });

    cy.contains("Invalid or expired verification token").should("be.visible");
    cy.contains("Resend verification email")
      .should("exist")
      .should("have.attr", "href")
      .and("include", "/auth/verify-email");
  });

  it("cannot reuse a consumed verification token", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success, "create_and_login_as_regular_user should succeed").to.be.true;
        cy.logout();

        cy.request({
          method: "GET",
          url: `/api/test/email-verification-token/${encodeURIComponent(credentials.email)}`,
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.equal(200);
          const token: string = response.body.token;

          // First use - should succeed
          cy.request({
            method: "POST",
            url: "/api/auth/verify-email/confirm",
            body: { token },
            failOnStatusCode: false,
          }).then((firstConfirm) => {
            expect(firstConfirm.status).to.equal(200);

            // Second use - should be rejected since token was already consumed
            cy.request({
              method: "POST",
              url: "/api/auth/verify-email/confirm",
              body: { token },
              failOnStatusCode: false,
            }).then((secondConfirm) => {
              expect(secondConfirm.status).to.equal(400);
            });
          });
        });
      });
    });
  });
});
