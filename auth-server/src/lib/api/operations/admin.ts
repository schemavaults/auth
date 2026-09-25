import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { listServerSettings } from "@/app/api/admin/settings/operation";
import { updateServerSetting } from "@/app/api/admin/settings/[key]/operation";
import { listAllUsers } from "@/app/api/admin/users/list/operation";
import { deleteUserAccount } from "@/app/api/admin/users/[uid]/operation";
import { disableUser, enableUser } from "@/app/api/admin/users/[uid]/disable/operation";
import { listUserMfaFactorTypes, resetUserMfa } from "@/app/api/admin/users/[uid]/mfa/operation";
import { resendUserVerificationEmail } from "@/app/api/admin/users/[uid]/resend-verification/operation";
import { listUserIssuedTokens } from "@/app/api/admin/users/[uid]/tokens/operation";
import { promoteUserToAdmin } from "@/app/api/admin/promote/[uid]/operation";
import { createInviteCode, listInviteCodes } from "@/app/api/admin/invite-codes/operation";
import { countInviteCodeUsages } from "@/app/api/admin/invite-codes/[invite_code]/usages/operation";
import { listBrandingAssets } from "@/app/api/admin/branding/operation";
import { removeBrandingAsset, uploadBrandingAsset } from "@/app/api/admin/branding/[asset]/operation";
import { deleteError } from "@/app/api/admin/errors/[error_id]/operation";
import { purgeErrorsBefore } from "@/app/api/admin/errors/operation";
import { listServerTraces } from "@/app/api/admin/server-traces/operation";
import { listServerTraceOperations } from "@/app/api/admin/server-traces/operations/operation";
import { sendDailyReportViaGet, sendDailyReportViaPost } from "@/app/api/admin/send-daily-report/operation";

/** Operations of the "admin" domain, in the order they appear in the docs. */
export const adminOperations: readonly AnyOperationDefinition[] = [
  // Users
  listAllUsers,
  deleteUserAccount,
  disableUser,
  enableUser,
  listUserMfaFactorTypes,
  resetUserMfa,
  resendUserVerificationEmail,
  listUserIssuedTokens,
  promoteUserToAdmin,
  // Invite codes
  listInviteCodes,
  createInviteCode,
  countInviteCodeUsages,
  // Settings & branding
  listServerSettings,
  updateServerSetting,
  listBrandingAssets,
  uploadBrandingAsset,
  removeBrandingAsset,
  // Diagnostics
  purgeErrorsBefore,
  deleteError,
  listServerTraces,
  listServerTraceOperations,
  sendDailyReportViaGet,
  sendDailyReportViaPost,
];
