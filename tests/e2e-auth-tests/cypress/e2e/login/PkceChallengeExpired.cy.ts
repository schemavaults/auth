// Verifies that POST /api/auth/session/generate-authorization-code rejects an
// otherwise-well-formed request whose `challenge_time` is older than the
// PKCE code-verifier max age (1 hour, see
// packages/auth-common/src/pkce/code_verifier.ts -> MAX_PKCE_CODE_VERIFIER_AGE).
//
// The guard lives in
// auth-server/src/app/api/auth/session/generate-authorization-code/POST_generate_authorization_code.ts
// (the `if (isPkceChallengeExpired(body.challenge_time))` branch). It must
// short-circuit BEFORE the authorization code is persisted, returning
// HTTP 400 with `error_id: "pkce_challenge_expired"` so that the front-end
// (AppAuthorizationConsentScreen / AuthForm) can redirect the user to
// `/error?error=400&error_id=pkce_challenge_expired` rather than minting a
// stale code that would later fail token exchange.
//
// The unauthenticated (401) case is covered by
// misc/UnauthenticatedApiRequests.cy.ts and the happy path is exercised
// indirectly by example_resource_server/ExampleResourceServer.cy.ts and
// OAuth2State.cy.ts. The expiry-rejection branch had no E2E coverage.

interface GenerateAuthorizationCodeFailureBody {
  success: boolean;
  message?: string;
  error_id?: string;
  authorization_code?: string;
}

describe("POST /api/auth/session/generate-authorization-code expired PKCE challenge", () => {
  it("returns 400 with error_id 'pkce_challenge_expired' when challenge_time is older than MAX_PKCE_CODE_VERIFIER_AGE", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then(
        (loggedIn: boolean) => {
          expect(loggedIn, "regular user login should succeed").to.be.true;

          // 2 hours in the past — comfortably older than the 1 hour max age,
          // even after worst-case clock skew between the test runner and
          // the auth-server.
          const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
          const expired_challenge_time: number = Date.now() - TWO_HOURS_MS;

          // Schema-valid placeholder code_challenge: 43 chars, base64url.
          // The expiry check runs before any further validation of the
          // challenge value itself, so any well-formed string is enough
          // to exercise the targeted branch.
          const code_challenge: string =
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
          expect(
            code_challenge,
            "code_challenge must satisfy MIN_CODE_CHALLENGE_LENGTH (43)",
          ).to.have.length(43);

          cy.request<GenerateAuthorizationCodeFailureBody>({
            method: "POST",
            url: "/api/auth/session/generate-authorization-code",
            failOnStatusCode: false,
            body: {
              // Any appIdSchema-valid id works here: the expiry check
              // rejects the request before the app id is ever looked up,
              // so no app row is needed in the test DB.
              client_app_id: "schemavaults-web",
              code_challenge,
              code_challenge_method: "S256",
              challenge_time: expired_challenge_time,
            },
          }).then((response) => {
            expect(
              response.status,
              "expired PKCE challenge should return HTTP 400",
            ).to.equal(400);
            expect(response.body).to.have.property("success", false);
            expect(
              response.body,
              "response should carry the machine-readable error_id so the front-end can redirect to the dedicated error page",
            ).to.have.property("error_id", "pkce_challenge_expired");
            expect(
              response.body,
              "no authorization_code should be minted for an expired challenge",
            ).to.not.have.property("authorization_code");
          });
        },
      );
    });
  });
});
