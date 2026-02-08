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

export {
  authenticateResultSchema,
  type AuthenticateResult,
} from "./authenticate_result";
export {
  requestTokensResultSchema,
  type RequestTokensResult,
  successfullyGeneratedTokensRecordSchema,
  type SuccessfullyGeneratedTokensRecord,
} from "./request_tokens_result";

export * from "./auth_acquire_tokens_grant_types";
export type * from "./auth_acquire_tokens_grant_types";

export { PRODUCTION_AUTH_SERVER_URL } from "@schemavaults/app-definitions";
export { appIdSchema } from "@schemavaults/app-definitions";

export { audienceSchema, audienceRefSchema } from "./audience-schema";

export {
  inviteCodeFormatSchema,
  inviteCodeDefinitionSchema,
} from "./invite-code";
export type { InviteCode, InviteCodeDefinition } from "./invite-code";

export {
  organizationIdSchema,
  isValidOrganizationID,
  organizationDefinitionSchema,
  hardcodedOrgs,
  SCHEMAVAULTS_ORGANIZATION_ID,
  MAXIMUM_USER_ORGANIZATIONS,
  MINIMUM_ORGANIZATION_ID_LENGTH,
  MAXIMUM_ORGANIZATION_ID_LENGTH,
  inviteMemberInputModes,
  inviteMemberFormSchema,
  organizationInvitationStatusTypes,
  organizationInvitationStatusSchema,
  organizationInvitationSchema,
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
