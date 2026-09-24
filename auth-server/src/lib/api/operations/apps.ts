import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { createApp, listApps } from "@/app/api/apps/operation";
import { deleteApp, getApp } from "@/app/api/apps/[app_id]/operation";
import { authorizeApp } from "@/app/api/apps/[app_id]/authorize/operation";
import { checkAppAuthorization } from "@/app/api/apps/[app_id]/check-authorization/operation";
import { createAppDomain, listAppDomains } from "@/app/api/apps/[app_id]/domains/operation";
import {
  createAppCallbackUrl,
  listAppCallbackUrls,
} from "@/app/api/apps/[app_id]/callback-urls/operation";
import { deleteAppCallbackUrl } from "@/app/api/apps/[app_id]/callback-urls/[app_callback_url_ref_id]/operation";
import {
  deleteClientSecret,
  generateClientSecretOperation,
  getClientSecretMetadata,
  rotateClientSecret,
} from "@/app/api/apps/[app_id]/client-secret/operation";
import {
  createAppServiceAccount,
  deleteAppServiceAccount,
  getAppServiceAccount,
} from "@/app/api/apps/[app_id]/service-account/operation";

/** Operations of the "apps" domain, in the order they appear in the docs. */
export const appsOperations: readonly AnyOperationDefinition[] = [
  listApps,
  createApp,
  getApp,
  deleteApp,
  checkAppAuthorization,
  authorizeApp,
  listAppDomains,
  createAppDomain,
  listAppCallbackUrls,
  createAppCallbackUrl,
  deleteAppCallbackUrl,
  getClientSecretMetadata,
  generateClientSecretOperation,
  rotateClientSecret,
  deleteClientSecret,
  getAppServiceAccount,
  createAppServiceAccount,
  deleteAppServiceAccount,
];
