// Class-based interface (backwards compatible)
export { UserRegistry } from "./user-registry";
export type { UserDocument } from "./user-registry";
export { userDocumentSchema } from "./parse-user-document";

// Standalone functional database scripts
export { getUserByEmail } from "./get-user-by-email";
export { getUserByUID } from "./get-user-by-uid";
export { listAllUsers } from "./list-all-users";
export { parseUserDocument } from "./parse-user-document";
export { getPasswordHash } from "./get-password-hash";
export { comparePassword } from "./compare-password";
export { generateAuthorizationCode } from "./generate-authorization-code";
export { validateAuthorizationCode } from "./validate-authorization-code";
export { createInviteCode } from "./create-invite-code";
export { listAllInviteCodes } from "./list-all-invite-codes";
export { isValidInviteCodeDefinition, areValidInviteCodeDefinitions } from "./validate-invite-code-definition";
export { promoteToAdmin } from "./promote-to-admin";
export { createUser } from "./create-user";
export { createPasswordResetToken } from "./create-password-reset-token";
export { validatePasswordResetToken } from "./validate-password-reset-token";
export { consumePasswordResetToken } from "./consume-password-reset-token";
export { updateUserPassword } from "./update-user-password";
export { createEmailVerificationToken } from "./create-email-verification-token";
export { validateEmailVerificationToken } from "./validate-email-verification-token";
export { consumeEmailVerificationToken } from "./consume-email-verification-token";
export { markEmailVerified } from "./mark-email-verified";

// Existing exports
export { loadUserData } from "./load-user-by-uid";
export { lookupInviteCode } from "./lookup-invite-code";
export { countInviteCodeUsages } from "./count-invite-code-usages";
export { default as doesSomeAdminUserExist } from "./does-some-admin-user-exist";

// Type exports
export type * from "./users-table";
export type * from "./passwords-table";
export type * from "./authorization-codes-table";
export type * from "./invite-codes-table";
export type * from "./ICreateUserOptions";
export type * from "./password-reset-tokens-table";
export type { ValidPasswordResetToken } from "./validate-password-reset-token";
export type * from "./email-verification-tokens-table";
export type { ValidEmailVerificationToken } from "./validate-email-verification-token";
