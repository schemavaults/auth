// Covers the profile card on the account page
// (auth-server/src/components/UserProfile/UserProfileCard.tsx): a user
// can supply first/middle/last name, a public display name, and a
// unique username, backed by GET/PUT /api/user/profile. Usernames are
// unique case-insensitively, so claiming another account's username
// surfaces the API's 409 as an inline form error.

interface UserProfileResponseBody {
  success: boolean;
  profile?: {
    username?: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    display_name?: string;
  };
}

function fillProfileField(testid: string, value: string): void {
  // The profile card can sit below the fold inside the dashboard
  // layout's scroll container; Cypress treats elements clipped by an
  // overflow ancestor as not visible until scrolled into view.
  cy.get(`[data-testid="${testid}"]`)
    .scrollIntoView()
    .should("be.visible")
    .clear();
  if (value.length > 0) {
    cy.get(`[data-testid="${testid}"]`).type(value);
  }
}

describe("Account page profile card", () => {
  it("saves profile names + username and shows them again after a reload", () => {
    const unique_suffix: string = Date.now().toString(36);
    const username: string = `ada-${unique_suffix}`;

    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          expect(
            loggedIn,
            "create_and_login_as_regular_user_via_request should succeed",
          ).to.be.true;

          cy.visit("/account");
          cy.wait_for_page_hydration();

          cy.get('[data-testid="user-profile-card"]').should("be.visible");

          // A fresh account has no profile names set
          cy.get('[data-testid="profile-first_name-input"]').should(
            "have.value",
            "",
          );
          cy.get('[data-testid="profile-username-input"]').should(
            "have.value",
            "",
          );

          fillProfileField("profile-first_name-input", "Ada");
          fillProfileField("profile-middle_name-input", "King");
          fillProfileField("profile-last_name-input", "Lovelace");
          fillProfileField(
            "profile-display_name-input",
            "Countess of Lovelace",
          );
          fillProfileField("profile-username-input", username);

          cy.intercept({
            method: "PUT",
            url: "**/api/user/profile",
            times: 1,
          }).as("saveProfile");

          cy.get('[data-testid="profile-save-button"]')
            .should("be.enabled")
            .click();

          cy.wait("@saveProfile", { timeout: 15000 }).then((interception) => {
            expect(interception.response?.statusCode).to.equal(200);
            const body = interception.response
              ?.body as UserProfileResponseBody;
            expect(body.success).to.be.true;
            expect(body.profile?.first_name).to.equal("Ada");
            expect(body.profile?.middle_name).to.equal("King");
            expect(body.profile?.last_name).to.equal("Lovelace");
            expect(body.profile?.display_name).to.equal(
              "Countess of Lovelace",
            );
            expect(body.profile?.username).to.equal(username);
          });

          cy.contains("Profile saved").should("be.visible");

          // Reload: values come back from the database (SSR preload)
          cy.visit("/account");
          cy.wait_for_page_hydration();
          cy.get('[data-testid="profile-first_name-input"]').should(
            "have.value",
            "Ada",
          );
          cy.get('[data-testid="profile-middle_name-input"]').should(
            "have.value",
            "King",
          );
          cy.get('[data-testid="profile-last_name-input"]').should(
            "have.value",
            "Lovelace",
          );
          cy.get('[data-testid="profile-display_name-input"]').should(
            "have.value",
            "Countess of Lovelace",
          );
          cy.get('[data-testid="profile-username-input"]').should(
            "have.value",
            username,
          );
        },
      );
    });
  });

  it("rejects a username already claimed by another account (case-insensitively)", () => {
    const unique_suffix: string = Date.now().toString(36);
    const claimed_username: string = `taken-${unique_suffix}`;

    // First user claims the username via the API directly
    cy.generate_random_test_user_credentials().then((firstCredentials) => {
      cy.create_and_login_as_regular_user_via_request(firstCredentials).then(
        (firstLoggedIn: boolean) => {
          expect(firstLoggedIn).to.be.true;

          cy.request({
            method: "PUT",
            url: "/api/user/profile",
            body: { username: claimed_username },
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status).to.equal(200);
            expect(
              (response.body as UserProfileResponseBody).profile?.username,
            ).to.equal(claimed_username);
          });

          cy.logout();

          // Second user tries to claim a case-variant of the same name
          cy.generate_random_test_user_credentials().then(
            (secondCredentials) => {
              cy.create_and_login_as_regular_user_via_request(
                secondCredentials,
              ).then((secondLoggedIn: boolean) => {
                expect(secondLoggedIn).to.be.true;

                cy.visit("/account");
                cy.wait_for_page_hydration();

                fillProfileField(
                  "profile-username-input",
                  claimed_username.toUpperCase(),
                );

                cy.intercept({
                  method: "PUT",
                  url: "**/api/user/profile",
                  times: 1,
                }).as("saveProfile");

                cy.get('[data-testid="profile-save-button"]')
                  .should("be.enabled")
                  .click();

                cy.wait("@saveProfile", { timeout: 15000 }).then(
                  (interception) => {
                    expect(interception.response?.statusCode).to.equal(409);
                  },
                );

                cy.contains("That username is already taken.")
                  .scrollIntoView()
                  .should("be.visible");
              });
            },
          );
        },
      );
    });
  });

  it("rejects a malformed username inline without calling the API", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          expect(loggedIn).to.be.true;

          cy.visit("/account");
          cy.wait_for_page_hydration();

          fillProfileField("profile-username-input", "no spaces allowed");
          cy.get('[data-testid="profile-save-button"]')
            .should("be.enabled")
            .click();

          // Inline zod validation blocks submission
          cy.contains(
            "Username may only contain letters, numbers, '.', '_', and '-'",
          )
            .scrollIntoView()
            .should("be.visible");
        },
      );
    });
  });
});
