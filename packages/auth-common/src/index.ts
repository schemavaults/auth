export {
  ERROR_MESSAGE_CATALOG,
  isValidErrorId,
} from "./auth-error-message-catalog";
export type { SchemaVaultsAuthErrorId } from "./auth-error-message-catalog";

export { userDataSchema, type UserData } from "./user_data";

export * from "./credentials";
export type * from "./credentials";

// Shapes of tokens
export * from "./token-data";
export type * from "./token-data";

// Auth state on the client
export type { AuthClientState } from "./frontend-client-state";

export * from "./middleware";
export type * from "./middleware";

export * from "./pkce";
export type * from "./pkce";

export * from "./oidc";
export type * from "./oidc";

export { sha256_base64url } from "./sha256_digest";

export {
  authenticateResultSchema,
  authenticatedAuthenticateResultSchema,
  mfaRequiredAuthenticateResultSchema,
  authenticateFailureResultSchema,
  challengeExpiredAuthenticateResultSchema,
  availableMfaFactorSchema,
  collapseWebauthnFactors,
  type AuthenticateResult,
  type AuthenticatedAuthenticateResult,
  type MfaRequiredAuthenticateResult,
  type AuthenticateFailureResult,
  type ChallengeExpiredAuthenticateResult,
  type AvailableMfaFactor,
} from "./authenticate_result";

export * from "./mfa";
export {
  createRequestTokensResultSchema,
  type RequestTokensResult,
  createSuccessfullyGeneratedTokensRecordSchema,
  type SuccessfullyGeneratedTokensRecord,
} from "./request_tokens_result";

export * from "./auth_acquire_tokens_grant_types";
export type * from "./auth_acquire_tokens_grant_types";

export { getAuthServerUrl } from "@schemavaults/app-definitions";
export { appIdSchema } from "@schemavaults/app-definitions";

export {
  createAudienceSchema,
  createAudienceListSchema,
} from "./audience-schema";

export {
  inviteCodeFormatSchema,
  inviteCodeDefinitionSchema,
} from "./invite-code";
export type { InviteCode, InviteCodeDefinition } from "./invite-code";

export {
  organizationIdSchema,
  isValidOrganizationID,
  RESERVED_ORGANIZATION_IDS,
  organizationDefinitionSchema,
  getHardcodedOrgs,
  getAuthServerOwnerOrganizationId,
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID,
  getAuthServerOwnerOrganizationName,
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME,
  MAXIMUM_USER_ORGANIZATIONS,
  MINIMUM_ORGANIZATION_ID_LENGTH,
  MAXIMUM_ORGANIZATION_ID_LENGTH,
  inviteMemberInputModes,
  inviteMemberFormSchema,
  organizationInvitationStatusTypes,
  organizationInvitationStatusSchema,
  organizationInvitationSchema,
  organizationMembershipRoleTypes,
  organizationMembershipRoleTypeSchema,
  isValidOrganizationMembershipRoleType,
  organizationMembershipRoleDetailsSchema,
  isValidOrganizationMembershipRoleDetails,
} from "./organizations";
export type {
  OrganizationID,
  OrganizationDefinition,
  InviteMemberInputMode,
  InviteMemberFormValues,
  InviteMemberSubmitData,
  OrganizationInvitationStatus,
  OrganizationInvitation,
  UserPendingInvitation,
  OrganizationInvitationWithUserData,
  OrganizationMembershipRoleType,
  OrganizationMembershipRoleDetails,
} from "./organizations";

export { MaximumBrowserCookieSize } from "./MaximumBrowserCookieSize";

export {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "./RefreshTokenCookieNames";

export {
  AccessTokenCookieName,
  AccessTokenExpiryCookieName,
} from "./AccessTokenCookieNames";

export { determineRefreshTokenCookieSameSiteValue } from "./determineRefreshTokenCookieSameSiteValue";

export { authorizeClientApplicationFormType } from "./authorize-client-application-form-type";

export {
  paginationOptionsSchema,
  DEFAULT_PAGINATION_PAGE_INDEX,
  DEFAULT_PAGINATION_PAGE_SIZE,
  isValidPaginationOptions,
} from "./pagination";
export type { PaginationOptions } from "./pagination";

export { timingSafeStringEqual } from "./timing-safe-string-equal";

export { isOriginInAllowedList } from "./cors";

export {
  oauth2StateSchema,
  OAUTH2_STATE_VSCHAR_REGEX,
  parseOAuth2State,
  OAuth2StateValidationError,
} from "./oauth2-state-schema";
export type { OAuth2State } from "./oauth2-state-schema";

export {
  createAuthorizationCodePOSTBodySchema,
  createRefreshTokenPOSTBodySchema,
} from "./auth_acquire_tokens_grant_types";
