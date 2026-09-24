/**
 * OpenAPI tags of the auth server's API. Every operation uses exactly one;
 * the docs index groups routes by them in this order.
 */
export const API_TAGS = {
  authentication: "Authentication",
  mfa: "Multi-factor authentication",
  oidc: "OpenID Connect / OAuth 2.0",
  account: "Account",
  apps: "Client applications",
  apis: "API servers",
  organizations: "Organizations",
  admin: "Administration",
  resourceServers: "Resource servers",
  configuration: "Configuration",
  testEnvironment: "Test environment",
} as const;

export type ApiTag = (typeof API_TAGS)[keyof typeof API_TAGS];

export const API_TAG_DESCRIPTIONS: readonly { name: ApiTag; description: string }[] = [
  {
    name: API_TAGS.authentication,
    description:
      "Login, registration, e-mail verification and password reset for the auth server's own login pages and the client SDK.",
  },
  {
    name: API_TAGS.mfa,
    description:
      "TOTP and passkey (WebAuthn) enrollment, the login MFA challenge, and recovery codes.",
  },
  {
    name: API_TAGS.oidc,
    description:
      "The standards-facing endpoints: discovery, authorization, token, userinfo, introspection, JWKS and dynamic client registration.",
  },
  {
    name: API_TAGS.account,
    description: "The signed-in user's own profile, organization memberships and invitations.",
  },
  {
    name: API_TAGS.apps,
    description:
      "Client application (OAuth client) registrations and their configuration: domains, callback URLs, client secrets, service accounts, user authorization.",
  },
  {
    name: API_TAGS.apis,
    description:
      "API server (resource server) registrations, their domains, JWKS access keys and app connections.",
  },
  {
    name: API_TAGS.organizations,
    description: "Organizations, their members and invitations.",
  },
  {
    name: API_TAGS.admin,
    description: "Platform administrator operations: users, invite codes, settings, branding, diagnostics.",
  },
  {
    name: API_TAGS.resourceServers,
    description:
      "Endpoints resource servers call on their own behalf with a JWKS access assertion: signing keys, allowed origins, membership lookups.",
  },
  {
    name: API_TAGS.configuration,
    description: "Public deployment configuration (environment, branding, invite code policy).",
  },
  {
    name: API_TAGS.testEnvironment,
    description:
      "Seeding and introspection endpoints used by the E2E suite. They respond 404 outside the `test` environment.",
  },
];
