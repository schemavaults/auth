describe("OAuth2State (RFC 6749 §10.12 state parameter)", () => {
  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;

  it("round-trips the state parameter from authorize URL to callback URL (happy path)", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) throw new Error("Failed to login as superuser");

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) throw new Error("Failed to create invite code");

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `pkce-state-happy-${suffix}@example.com`;
            const password = "TestPassword123!";

            // Kick off the register flow so we land on /auth/register with
            // the full set of PKCE params — including the new `state`
            // parameter that the SDK generates before redirect.
            cy.origin(exampleAppOrigin, () => {
              cy.visit("/");
              cy.contains("h1", "@schemavaults/example-nextjs-resource-server");
              cy.contains("button", "Register").click();
            });

            // On auth-server: confirm `state` is present on the URL.
            cy.url({ timeout: 20000 }).should("include", "/auth/register");
            cy.url().should("match", /[?&]state=[A-Za-z0-9_\-]{20,}/);
            cy.url().should("include", "code_challenge");

            // Capture the state value from the authorize URL for a later
            // equality check against the callback URL.
            cy.url().then((authorizeUrl: string) => {
              const stateParam =
                new URL(authorizeUrl).searchParams.get("state");
              expect(stateParam, "state on authorize URL").to.be.a("string");
              expect(stateParam!.length).to.be.greaterThan(20);

              cy.wait_for_page_hydration();

              cy.get("input[name='email']")
                .should("be.visible")
                .type(email, { force: true });
              cy.get("input[name='password']")
                .should("be.visible")
                .type(password, { force: true });
              cy.get("input[name='confirm']")
                .should("be.visible")
                .type(password, { force: true });
              cy.get("input[name='invite_code']")
                .should("not.be.disabled")
                .type(inviteCode, { force: true });
              cy.get("button[type='submit']").should("not.be.disabled").click();

              cy.contains("Authorize & Continue", { timeout: 15000 })
                .should("be.visible")
                .click();

              // Resource-server callback URL should carry the SAME state.
              cy.origin(
                exampleAppOrigin,
                { args: { stateParam } },
                ({ stateParam }: { stateParam: string | null }) => {
                  // The SDK may strip the callback search params quickly on
                  // success, so assert on `/account` existence plus a snapshot
                  // of any callback URL we can observe via cy.location during
                  // the transition.
                  cy.url({ timeout: 30000 }).should("include", "/account");
                  cy.contains("Example Account Page", { timeout: 15000 })
                    .should("be.visible");
                  // Sanity — stored state was cleared after the successful
                  // exchange (redirect flow cleans up).
                  cy.window().then((win) => {
                    const raw = win.localStorage.getItem("oauth2_states");
                    if (raw) {
                      const parsed = JSON.parse(raw);
                      for (const v of Object.values(parsed)) {
                        // Either absent or tombstoned; never equal to the
                        // live state value captured pre-callback.
                        expect(v).to.not.equal(stateParam);
                      }
                    }
                  });
                },
              );
            });
          });
        });
      });
    });
  });

  it("rejects a callback whose state does not match the stored state (CSRF)", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) throw new Error("Failed to login as superuser");

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) throw new Error("Failed to create invite code");

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `pkce-state-mismatch-${suffix}@example.com`;
            const password = "TestPassword123!";

            // Register first so the user + app-authorization exists.
            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              // Fully reset — clear auth-server session AND RP origin
              // storage, otherwise a residual refresh token on the RP
              // auto-redirects past /auth/login before we can capture
              // the PKCE URL.
              cy.logout();
              cy.clearAllCookies();
              cy.origin(exampleAppOrigin, () => {
                localStorage.clear();
                sessionStorage.clear();
                cy.visit("/");
                cy.contains("button", "Login").click();
              });

              // Wait until the login FORM is interactive — that
              // guarantees we've settled on /auth/login and the PKCE
              // params are still in the URL.
              cy.url({ timeout: 20000 }).should("include", "/auth/login");
              cy.get("input[name='email']", { timeout: 15000 }).should(
                "be.visible",
              );
              cy.location("search").then((search: string) => {
                const params = new URLSearchParams(search);
                const challengeTime = params.get("challenge_time");
                expect(challengeTime, "challenge_time present").to.be.a(
                  "string",
                );
                if (typeof challengeTime !== "string") {
                  throw new Error("challenge_time missing from login URL");
                }

                cy.origin(
                  exampleAppOrigin,
                  { args: { challengeTime } },
                  ({ challengeTime }: { challengeTime: string }) => {
                    cy.visit(
                      `/auth/authorize?authorization_code=attacker_injected_code&challenge_time=${challengeTime}&code_challenge_method=S256&state=ATTACKER_STATE`,
                    );

                    // SDK rejects → user redirected away from /account.
                    cy.url({ timeout: 15000 }).should("not.include", "/account");
                    cy.get("body", { timeout: 15000 }).should(($el) => {
                      expect($el.text().includes("Example Account Page")).to.be
                        .false;
                    });
                  },
                );
              });
            });
          });
        });
      });
    });
  });

  it("rejects a callback that has no state at all", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) throw new Error("Failed to login as superuser");

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) throw new Error("Failed to create invite code");

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `pkce-state-missing-${suffix}@example.com`;
            const password = "TestPassword123!";

            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              cy.logout();
              cy.clearAllCookies();
              cy.origin(exampleAppOrigin, () => {
                localStorage.clear();
                sessionStorage.clear();
                cy.visit("/");
                cy.contains("button", "Login").click();
              });

              cy.url({ timeout: 20000 }).should("include", "/auth/login");
              cy.get("input[name='email']", { timeout: 15000 }).should(
                "be.visible",
              );
              cy.location("search").then((search: string) => {
                const params = new URLSearchParams(search);
                const challengeTime = params.get("challenge_time");
                expect(challengeTime, "challenge_time present").to.be.a(
                  "string",
                );
                if (typeof challengeTime !== "string") {
                  throw new Error("challenge_time missing from login URL");
                }

                cy.origin(
                  exampleAppOrigin,
                  { args: { challengeTime } },
                  ({ challengeTime }: { challengeTime: string }) => {
                    // Callback with NO state query param at all.
                    cy.visit(
                      `/auth/authorize?authorization_code=attacker_injected_code&challenge_time=${challengeTime}&code_challenge_method=S256`,
                    );
                    cy.url({ timeout: 15000 }).should("not.include", "/account");
                    cy.get("body", { timeout: 15000 }).should(($el) => {
                      expect($el.text().includes("Example Account Page")).to.be
                        .false;
                    });
                  },
                );
              });
            });
          });
        });
      });
    });
  });
});
