describe("Reset Password", () => {
  it("can load the reset password page", () => {
    cy.visit("/auth/reset-password");
    cy.url().should("include", "/auth/reset-password");
    cy.contains("Reset your").should("be.visible");
    cy.get("input[name='email']").should("exist").should("be.visible");
  });

  it("has a 'Forgot password?' link on the login page", () => {
    cy.visit("/auth/login");
    cy.wait_for_page_hydration();
    cy.contains("Forgot password?")
      .should("exist")
      .should("be.visible")
      .should("have.attr", "href")
      .and("include", "/auth/reset-password");
  });

  it("can navigate from login to reset password via 'Forgot password?' link", () => {
    cy.visit("/auth/login");
    cy.wait_for_page_hydration();
    cy.contains("Forgot password?").click();
    cy.url().should("include", "/auth/reset-password");
  });

  it("has a 'Sign in' link on the reset password page to go back to login", () => {
    cy.visit("/auth/reset-password");
    cy.wait_for_page_hydration();
    cy.contains("Sign in")
      .should("exist")
      .should("have.attr", "href")
      .and("include", "/auth/login");
  });

  it("can submit the request reset form and see a success toast", () => {
    cy.visit("/auth/reset-password");
    cy.wait_for_page_hydration();

    cy.intercept({
      method: "POST",
      url: "**/api/auth/reset-password/request",
      times: 1,
    }).as("resetRequest");

    cy.get("input[name='email']").type("nonexistent@example.com", {
      force: true,
    });
    cy.get("button[type='submit']").click();

    cy.wait("@resetRequest", { timeout: 15000 }).then((interception) => {
      // Should always return 200 regardless of whether user exists (prevents email enumeration)
      expect(interception.response?.statusCode).to.equal(200);
    });

    // Should show a success toast
    cy.contains("Check your email").should("be.visible");
  });

  it("can reset a user's password via token and login with the new password", () => {
    const newPassword = "NewPassword456!@#";

    cy.generate_random_test_user_credentials().then((credentials) => {
      // Step 1: Create a user to reset password for
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success).to.be.true;
        cy.logout();

        // Step 2: Get a password reset token via the test-only endpoint
        cy.request({
          method: "GET",
          url: `/api/test/password-reset-token/${encodeURIComponent(credentials.email)}`,
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.equal(200);
          expect(response.body.success).to.be.true;
          expect(response.body.token).to.be.a("string");

          const token: string = response.body.token;

          // Step 3: Visit the reset password page with the token
          cy.visit(`/auth/reset-password?token=${token}`);
          cy.wait_for_page_hydration();

          // Should show the "Set a new password" form
          cy.contains("Set a new password").should("be.visible");
          cy.get("input[name='new_password']").should("exist").should("be.visible");
          cy.get("input[name='confirm_password']").should("exist").should("be.visible");

          // Step 4: Fill in and submit the new password form
          cy.intercept({
            method: "POST",
            url: "**/api/auth/reset-password/confirm",
            times: 1,
          }).as("confirmReset");

          cy.get("input[name='new_password']").type(newPassword, { force: true });
          cy.get("input[name='confirm_password']").type(newPassword, { force: true });
          cy.get("button[type='submit']").click();

          cy.wait("@confirmReset", { timeout: 15000 }).then((interception) => {
            expect(interception.response?.statusCode).to.equal(200);
          });

          // Should redirect to login page
          cy.url({ timeout: 10000 }).should("include", "/auth/login");

          // Step 5: Login with the new password
          cy.login(credentials.email, newPassword).then((loginSuccess) => {
            expect(loginSuccess).to.be.true;
            cy.url().should("include", "/account");
          });
        });
      });
    });
  });

  it("rejects an invalid/expired reset token", () => {
    cy.visit(`/auth/reset-password?token=00000000-0000-0000-0000-000000000000`);
    cy.wait_for_page_hydration();

    cy.contains("Set a new password").should("be.visible");

    cy.intercept({
      method: "POST",
      url: "**/api/auth/reset-password/confirm",
      times: 1,
    }).as("confirmReset");

    cy.get("input[name='new_password']").type("NewPassword789!@#", { force: true });
    cy.get("input[name='confirm_password']").type("NewPassword789!@#", { force: true });
    cy.get("button[type='submit']").click();

    cy.wait("@confirmReset", { timeout: 15000 }).then((interception) => {
      expect(interception.response?.statusCode).to.equal(400);
    });

    // Should show error toast
    cy.contains("Invalid or expired reset token").should("be.visible");
  });

  it("cannot reuse a consumed reset token", () => {
    const newPassword1 = "FirstNewPass123!@#";
    const newPassword2 = "SecondNewPass456!@#";

    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success).to.be.true;
        cy.logout();

        // Get a reset token
        cy.request({
          method: "GET",
          url: `/api/test/password-reset-token/${encodeURIComponent(credentials.email)}`,
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.equal(200);
          const token: string = response.body.token;

          // Use the token to reset password
          cy.visit(`/auth/reset-password?token=${token}`);
          cy.wait_for_page_hydration();

          cy.intercept({
            method: "POST",
            url: "**/api/auth/reset-password/confirm",
            times: 1,
          }).as("firstReset");

          cy.get("input[name='new_password']").type(newPassword1, { force: true });
          cy.get("input[name='confirm_password']").type(newPassword1, { force: true });
          cy.get("button[type='submit']").click();

          cy.wait("@firstReset", { timeout: 15000 }).then((interception) => {
            expect(interception.response?.statusCode).to.equal(200);
          });

          // Wait for redirect to login
          cy.url({ timeout: 10000 }).should("include", "/auth/login");

          // Try to reuse the same token
          cy.visit(`/auth/reset-password?token=${token}`);
          cy.wait_for_page_hydration();

          cy.intercept({
            method: "POST",
            url: "**/api/auth/reset-password/confirm",
            times: 1,
          }).as("secondReset");

          cy.get("input[name='new_password']").type(newPassword2, { force: true });
          cy.get("input[name='confirm_password']").type(newPassword2, { force: true });
          cy.get("button[type='submit']").click();

          cy.wait("@secondReset", { timeout: 15000 }).then((interception) => {
            // Should be rejected since token was already consumed
            expect(interception.response?.statusCode).to.equal(400);
          });

          cy.contains("Invalid or expired reset token").should("be.visible");
        });
      });
    });
  });

  it("old password no longer works after reset", () => {
    const newPassword = "ResetPassword999!@#";

    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success).to.be.true;
        cy.logout();

        // Get token and reset password
        cy.request({
          method: "GET",
          url: `/api/test/password-reset-token/${encodeURIComponent(credentials.email)}`,
        }).then((response) => {
          const token: string = response.body.token;

          // Reset via API directly (faster than UI for this check)
          cy.request({
            method: "POST",
            url: "/api/auth/reset-password/confirm",
            body: { token, new_password: newPassword },
            failOnStatusCode: false,
          }).then((confirmResponse) => {
            expect(confirmResponse.status).to.equal(200);

            // Try to login with old password - should fail
            cy.visit("/auth/login");
            cy.wait_for_page_hydration();

            cy.intercept({
              method: "POST",
              url: "**/api/auth/login",
              times: 1,
            }).as("oldPasswordLogin");

            cy.get("input[name='email']").type(credentials.email, { force: true });
            cy.get("input[name='password']").type(credentials.password, { force: true });
            cy.get("button[type='submit']").click();

            cy.wait("@oldPasswordLogin", { timeout: 15000 }).then((interception) => {
              expect(interception.response?.statusCode).to.equal(401);
            });

            // Should still be on login page
            cy.url().should("include", "/auth/login");
          });
        });
      });
    });
  });
});
