// EmailVerificationRequiredForThirdPartyApps.cy.ts
//
// The `require_email_verification_for_third_party_apps` server setting
// (default: on) gates every hand-off to a THIRD-PARTY client app — here
// the seeded example resource server — while the signed-in account's
// e-mail address is unverified:
//   - POST /api/auth/login and /api/auth/register for the third-party
//     `client_app_id` answer 200 `kind: "email_verification_required"`
//     (auth server session cookie set, NO authorization_code), and the
//     forms park the user on /auth/verify-email/required with the flow's
//     parameters; the auth server's own (first-party) flow is unchanged;
//   - the already-signed-in branch of /auth/login?app_id=… redirects an
//     unverified user to the same interstitial instead of showing the
//     consent screen / redirecting to the app;
//   - POST /api/auth/session/generate-authorization-code (the consent
//     screen's mint) refuses with 403 `error_id: email_verification_required`;
//   - the interstitial offers to re-send the verification link and resumes
//     the flow ("I've verified my email" → /auth/login?<same params>) once
//     the address is verified;
//   - the authenticated dashboard shows a verification banner;
//   - an administrator can switch the gate off, after which unverified
//     users reach the app as before.
//
// The public (PKCE-only) example-resource-server app is seeded in
// cypress.config.ts's before:run hook with the example app's origin as
// its registered domain, so any path on that origin is a valid
// redirect_uri.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

interface AuthenticateResponseBody {
  kind?: string;
  success?: boolean;
  message?: string;
  authorization_code?: string;
}

interface GenerateAuthorizationCodeResponseBody {
  success?: boolean;
  message?: string;
  error_id?: string;
  authorization_code?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

describe("Email verification required before third-party app hand-off", () => {
  const SETTING_KEY = "require_email_verification_for_third_party_apps";

  // The app id seeded for the example resource server in
  // cypress.config.ts's before:run hook (a public client), and the name
  // the seed registers it under.
  const CLIENT_ID = "00000000-0000-0000-0000-000000000000";
  const CLIENT_APP_NAME = "Example Frontend App";

  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  // Normalize origin to strip default port 80 — cy.origin() requires
  // the argument to match the browser's normalised origin exactly.
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;
  const REDIRECT_URI = `${exampleAppOrigin}/oauth2/callback`;

  const INTERSTITIAL_PATH = "/auth/verify-email/required";
  const CARD = '[data-testid="email-verification-required-card"]';
  const CARD_APP_NAME = '[data-testid="email-verification-required-app-name"]';
  const CARD_EMAIL = '[data-testid="email-verification-required-email"]';
  const RESEND_BUTTON = '[data-testid="resend-verification-email-button"]';
  const CONTINUE_BUTTON =
    '[data-testid="continue-after-email-verification-button"]';

  function createPkceChallenge(): Cypress.Chainable<CodeChallengeWithDetails> {
    const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
    return cy.wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
      PKCE_ProofKeyManager.createCodeChallenge(verifier),
      { log: false },
    );
  }

  /**
   * Starts the example resource server's login flow: clears the SDK's
   * stored state on the RP origin (refresh tokens live in localStorage in
   * test), visits its home page and clicks "Login", which redirects to the
   * auth server's /auth/login with the PKCE params. Auth server cookies
   * are left alone so callers decide whether a session is present.
   */
  function startResourceServerLoginFlow(): void {
    cy.origin(exampleAppOrigin, () => {
      localStorage.clear();
      sessionStorage.clear();
      cy.visit("/");
      cy.contains("h1", "@schemavaults/example-nextjs-resource-server");
      cy.contains("button", "Login").click();
    });
  }

  /** Fills and submits the auth server's login form (already on /auth/login). */
  function submitLoginForm(email: string, password: string): void {
    cy.get("input[name='email']")
      .should("be.visible")
      .type(email, { force: true });
    cy.get("input[name='password']")
      .should("be.visible")
      .type(password, { force: true });
    cy.get("button[type='submit']").should("not.be.disabled").click();
  }

  function expectInterstitial(email: string): void {
    cy.url({ timeout: 20000 }).should("include", INTERSTITIAL_PATH);
    cy.url().should("include", `app_id=${CLIENT_ID}`);
    cy.url().should("include", "code_challenge");
    cy.url().should("include", "redirect_uri");
    cy.wait_for_page_hydration();
    cy.get(CARD, { timeout: 15000 }).should("be.visible");
    cy.get(CARD_APP_NAME).should("be.visible").and("have.text", CLIENT_APP_NAME);
    cy.get(CARD_EMAIL).should("be.visible").and("have.text", email);
    // Neither the consent screen nor the app: the user stays parked.
    cy.contains("Authorize & Continue").should("not.exist");
  }

  function expectResourceServerAccountPage(): void {
    cy.origin(exampleAppOrigin, () => {
      cy.url({ timeout: 30000 }).should("include", "/account");
      cy.contains("Example Account Page", { timeout: 15000 }).should(
        "be.visible",
      );
      cy.contains(
        "If you're seeing this it means that you were not redirected because you are logged in!",
      ).should("be.visible");
    });
  }

  /**
   * The superuser login helper asserts that nobody is signed in first; a
   * failed assertion earlier in a test can leave a session behind, so
   * every superuser step starts from a signed-out state.
   */
  function loginAsSuperuser(): void {
    cy.is_authenticated().then((authenticated: boolean) => {
      if (authenticated) {
        cy.logout();
      }
    });
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
  }

  function setRequireEmailVerification(enabled: boolean): void {
    loginAsSuperuser();
    cy.request({
      method: "PATCH",
      url: `/api/admin/settings/${SETTING_KEY}`,
      body: { value: enabled },
    }).then((response) => {
      expect(response.status, `set ${SETTING_KEY}=${enabled}`).to.equal(200);
    });
    cy.logout();
  }

  beforeEach(() => {
    cy.reset_rate_limit();
  });

  it("parks a user registering through the resource server on the interstitial until the email is verified", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) throw new Error("Failed to login as superuser");

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) throw new Error("Failed to create invite code");

          cy.logout();

          cy.generate_random_test_user_credentials().then(
            ({ email, password }) => {
              // Step 1: The resource server's "Register" button sends the
              // user to the auth server's /auth/register with PKCE params.
              cy.clearAllCookies();
              cy.origin(exampleAppOrigin, () => {
                localStorage.clear();
                sessionStorage.clear();
                cy.visit("/");
                cy.contains("h1", "@schemavaults/example-nextjs-resource-server");
                cy.contains("button", "Register").click();
              });

              cy.url({ timeout: 20000 }).should("include", "/auth/register");
              cy.url().should("include", "code_challenge");
              cy.wait_for_page_hydration();

              // Step 2: Register. The account is brand new, hence
              // unverified: the register API accepts the credentials
              // (session cookie) but mints no code for the third-party app.
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

              cy.intercept({ method: "POST", url: "**/api/auth/register" }).as(
                "registerRequest",
              );
              cy.get("button[type='submit']").should("not.be.disabled").click();

              cy.wait("@registerRequest", { timeout: 20000 }).then(
                (interception) => {
                  expect(
                    interception.response?.statusCode,
                    "register status",
                  ).to.equal(200);
                  const body = interception.response
                    ?.body as AuthenticateResponseBody;
                  expect(body.kind, "register kind").to.equal(
                    "email_verification_required",
                  );
                  expect(body.success, "register success").to.equal(true);
                  expect(body.authorization_code, "no authorization_code").to
                    .be.undefined;
                },
              );

              // Step 3: Parked on the interstitial, not on the resource
              // server, naming the app and the address to verify.
              expectInterstitial(email);
              cy.is_authenticated().should(
                "equal",
                true,
                "the auth server session cookie was set by the register call",
              );

              // Step 4: "Resend verification email" re-requests the link
              // for the signed-in address.
              cy.reset_rate_limit();
              cy.intercept({
                method: "POST",
                url: "**/api/auth/verify-email/request",
                times: 1,
              }).as("resendRequest");
              cy.get(RESEND_BUTTON).should("not.be.disabled").click();
              cy.wait("@resendRequest", { timeout: 15000 }).then(
                (interception) => {
                  expect(interception.request.body).to.deep.equal({ email });
                  expect(interception.response?.statusCode).to.equal(200);
                },
              );
              cy.contains("Check your email", { timeout: 10000 }).should(
                "be.visible",
              );

              // Step 5: "I've verified my email" while still unverified
              // re-enters /auth/login with the flow's params, whose
              // already-signed-in branch sends the user straight back to
              // the interstitial (a fresh page load: the button is enabled
              // again).
              cy.intercept({
                method: "GET",
                pathname: "/auth/login",
                times: 1,
              }).as("resumeWhileUnverified");
              cy.get(CONTINUE_BUTTON).should("not.be.disabled").click();
              cy.wait("@resumeWhileUnverified", { timeout: 20000 }).then(
                (interception) => {
                  expect(
                    new URL(interception.request.url).searchParams.get("app_id"),
                    "resume URL app_id",
                  ).to.equal(CLIENT_ID);
                },
              );
              expectInterstitial(email);
              cy.get(CONTINUE_BUTTON).should("not.be.disabled");

              // Step 6: Verify the address out of band (what clicking the
              // e-mailed link in another tab does). The interstitial polls
              // `whoami` every few seconds and continues on its own once
              // the address is verified — no click needed: the login page
              // mints the code, asks for consent (the app was never
              // authorized) and redirects to the resource server.
              cy.verify_email_via_request(email).then((verified: boolean) => {
                expect(verified, "email verified").to.be.true;
              });

              // The server-rendered consent page keeps the button disabled
              // until the auth client is ready; wait for it.
              cy.contains("Authorize & Continue", { timeout: 30000 })
                .should("be.visible")
                .should("not.be.disabled")
                .click();

              expectResourceServerAccountPage();
            },
          );
        });
      });
    });
  });

  it("parks an unverified user logging in through the resource server; the first-party login is unchanged", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (ok: boolean) => {
          expect(ok, "create_and_login_as_regular_user_via_request").to.be.true;
          cy.logout();
        },
      );

      // Third-party flow from the resource server: the login API accepts
      // the credentials but answers `email_verification_required` and
      // mints no authorization code.
      cy.clearAllCookies();
      startResourceServerLoginFlow();
      cy.url({ timeout: 20000 }).should("include", "/auth/login");
      cy.url().should("include", "code_challenge");
      cy.wait_for_page_hydration();

      cy.intercept({ method: "POST", url: "**/api/auth/login" }).as(
        "thirdPartyLogin",
      );
      submitLoginForm(credentials.email, credentials.password);

      cy.wait("@thirdPartyLogin", { timeout: 20000 }).then((interception) => {
        expect(interception.response?.statusCode, "login status").to.equal(200);
        const body = interception.response?.body as AuthenticateResponseBody;
        expect(body.kind, "login kind").to.equal(
          "email_verification_required",
        );
        expect(body.success, "login success").to.equal(true);
        expect(body.message, "login message").to.be.a("string").and.not.be
          .empty;
        expect(body.authorization_code, "no authorization_code").to.be
          .undefined;
      });

      expectInterstitial(credentials.email);

      // Control: the same credentials against the auth server's own app id
      // (the account page flow) still authenticate with a code. The
      // session cookie set above belongs to the same user, so
      // re-authenticating is allowed.
      cy.reset_rate_limit();
      createPkceChallenge().then((challenge) => {
        cy.request<AuthenticateResponseBody>({
          method: "POST",
          url: "/api/auth/login",
          failOnStatusCode: false,
          body: {
            credentials: {
              email: credentials.email,
              password: credentials.password,
            },
            client_app_id: getAuthServerAppIdFromCypressEnv(),
            code_challenge: challenge.code_challenge,
            challenge_time: challenge.challenge_time,
            redirect_uri: null,
            nonce: `e2e-nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            scope: DEFAULT_AUTH_SCOPE,
          },
        }).then((response) => {
          expect(response.status, "first-party login status").to.equal(200);
          expect(response.body.kind, "first-party login kind").to.equal(
            "authenticated",
          );
          expect(
            response.body.authorization_code,
            "first-party authorization_code",
          ).to.be.a("string").and.not.be.empty;
        });
      });
    });
  });

  it("redirects an unverified user who is already signed in to the auth server to the interstitial (no consent, no app redirect)", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (ok: boolean) => {
          expect(ok, "create_and_login_as_regular_user_via_request").to.be.true;
        },
      );
      // Establish the auth server session through the browser (the login
      // page on the primary origin) rather than leaving it to the cookies
      // cy.request set: only a browser-set session cookie reliably travels
      // with the cross-origin navigation back from the resource server
      // (see ExampleResourceServer.cy.ts, "auto-completes PKCE flow with
      // existing auth-server session").
      cy.logout();
      cy.login(credentials.email, credentials.password).then(
        (loggedIn: boolean) => {
          expect(loggedIn, "login on the auth server").to.be.true;
        },
      );
      cy.is_authenticated().should("equal", true);

      // With the auth server session cookie present, /auth/login?app_id=…
      // takes its already-signed-in branch, which re-checks the gate
      // before consent / minting and parks the unverified user.
      startResourceServerLoginFlow();
      expectInterstitial(credentials.email);
      cy.get("input[name='email']").should("not.exist");
      cy.get('[data-testid="consent-redirect-host"]').should("not.exist");
    });
  });

  it("POST /api/auth/session/generate-authorization-code refuses a third-party code for an unverified session with 403 email_verification_required", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (ok: boolean) => {
          expect(ok, "create_and_login_as_regular_user_via_request").to.be.true;
        },
      );

      function mintForExampleApp(): Cypress.Chainable<
        Cypress.Response<GenerateAuthorizationCodeResponseBody>
      > {
        return createPkceChallenge().then((challenge) =>
          cy.request<GenerateAuthorizationCodeResponseBody>({
            method: "POST",
            url: "/api/auth/session/generate-authorization-code",
            failOnStatusCode: false,
            body: {
              client_app_id: CLIENT_ID,
              code_challenge: challenge.code_challenge,
              code_challenge_method: "S256",
              challenge_time: challenge.challenge_time,
              redirect_uri: REDIRECT_URI,
              nonce: `e2e-nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              scope: DEFAULT_AUTH_SCOPE,
            },
          }),
        );
      }

      mintForExampleApp().then((response) => {
        expect(response.status, "unverified mint status").to.equal(403);
        expect(response.body.success, "unverified mint success").to.equal(
          false,
        );
        expect(response.body.error_id, "unverified mint error_id").to.equal(
          "email_verification_required",
        );
        expect(response.body.message, "unverified mint message").to.be.a(
          "string",
        ).and.not.be.empty;
        expect(response.body.authorization_code, "no authorization_code").to
          .be.undefined;
      });

      // Once verified, the very same request mints a code: the e-mail gate
      // was the only thing in the way.
      cy.verify_email_via_request(credentials.email).then(
        (verified: boolean) => {
          expect(verified, "email verified").to.be.true;
        },
      );
      mintForExampleApp().then((response) => {
        expect(response.status, "verified mint status").to.equal(200);
        expect(response.body.success, "verified mint success").to.equal(true);
        expect(response.body.authorization_code, "authorization_code").to.be.a(
          "string",
        ).and.not.be.empty;
      });
    });
  });

  it("shows the email verification banner on the dashboard for an unverified user only", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (ok: boolean) => {
          expect(ok, "create_and_login_as_regular_user_via_request").to.be.true;
        },
      );

      cy.visit("/account");
      cy.wait_for_page_hydration();
      cy.get('[data-testid="email-verification-banner"]', { timeout: 15000 })
        .should("be.visible")
        .and("contain.text", credentials.email);
      cy.get('[data-testid="email-verification-banner-resend-button"]')
        .should("be.visible")
        .and("not.be.disabled");

      // Verify the address and sign in again so the session's user data
      // carries email_verified=true: the banner is gone.
      cy.logout();
      cy.verify_email_via_request(credentials.email).then(
        (verified: boolean) => {
          expect(verified, "email verified").to.be.true;
        },
      );
      cy.login_via_request(credentials.email, credentials.password).then(
        (loggedIn: boolean) => {
          expect(loggedIn, "login_via_request after verification").to.be.true;
        },
      );

      cy.visit("/account");
      cy.wait_for_page_hydration();
      cy.get('[data-testid="email-verification-status-button"]', {
        timeout: 15000,
      }).should("be.visible");
      cy.get('[data-testid="email-verification-banner"]').should("not.exist");
    });
  });

  describe("with the setting switched off by an administrator", () => {
    before(() => {
      setRequireEmailVerification(false);
    });

    after(() => {
      // Leave the deployment as we found it: the gate on.
      setRequireEmailVerification(true);
    });

    it("lets an unverified user sign in through the resource server without the interstitial", () => {
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request(credentials).then(
          (ok: boolean) => {
            expect(ok, "create_and_login_as_regular_user_via_request").to.be
              .true;
            cy.logout();
          },
        );

        // Registered before the helper's own intercept so this alias sees
        // the same login call; the helper tolerates both outcomes, the
        // assertion below pins the gate-off one.
        cy.intercept({ method: "POST", url: "**/api/auth/login" }).as(
          "gateOffLogin",
        );

        cy.login_via_resource_server_pkce_flow({
          resource_server_origin: exampleAppOrigin,
          email: credentials.email,
          password: credentials.password,
        }).then((loggedIn: boolean) => {
          expect(loggedIn, "login_via_resource_server_pkce_flow").to.be.true;
        });

        cy.get("@gateOffLogin").then((interception) => {
          const body = (
            interception as unknown as {
              response?: { statusCode?: number; body?: AuthenticateResponseBody };
            }
          ).response;
          expect(body?.statusCode, "gate-off login status").to.equal(200);
          expect(body?.body?.kind, "gate-off login kind").to.equal(
            "authenticated",
          );
          expect(
            body?.body?.authorization_code,
            "gate-off authorization_code",
          ).to.be.a("string").and.not.be.empty;
        });

        expectResourceServerAccountPage();
      });
    });
  });
});
