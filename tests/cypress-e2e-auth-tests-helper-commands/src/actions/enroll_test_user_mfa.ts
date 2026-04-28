// Test-only helper that uses the auth-server's
// /api/test/seed/enroll-test-user-mfa endpoint to atomically enrol a
// user into MFA with a known TOTP secret + recovery codes. Returns the
// secret + codes so callers can compute valid TOTP values at test time.

export interface EnrollTestUserMfaParams {
  email: string;
}

export interface EnrollTestUserMfaResult {
  uid: string;
  factor_id: string;
  secret: string;
  recovery_codes: readonly string[];
}

export default function enroll_test_user_mfa(
  params: EnrollTestUserMfaParams,
): Cypress.Chainable<EnrollTestUserMfaResult> {
  return cy
    .request({
      method: "POST",
      url: "/api/test/seed/enroll-test-user-mfa",
      body: { email: params.email },
      failOnStatusCode: true,
    })
    .then((response): EnrollTestUserMfaResult => {
      const body = response.body as {
        success: boolean;
        uid: string;
        factor_id: string;
        secret: string;
        recovery_codes: readonly string[];
      };
      if (!body.success) {
        throw new Error("Failed to enroll test user MFA");
      }
      return {
        uid: body.uid,
        factor_id: body.factor_id,
        secret: body.secret,
        recovery_codes: body.recovery_codes,
      };
    });
}
