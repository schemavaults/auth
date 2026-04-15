/**
 * Maximum lifetime of an OAuth2 authorization code.
 *
 * Per RFC 6749 §4.1.2, authorization codes MUST be single-use and short-lived;
 * a maximum lifetime of 10 minutes is RECOMMENDED.
 *
 * This is distinct from {@link MAX_PKCE_CODE_VERIFIER_AGE}, which bounds how
 * long a user may sit on the `/authorize` page before submitting. The
 * authorization code age bounds how long the client application has to
 * exchange a received authorization code for tokens at the token endpoint.
 */
export const MAX_AUTHORIZATION_CODE_AGE: number = 10 * 60 * 1000; // 10 minutes
