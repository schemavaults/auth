import type { SchemaVaultsAppDomainRef } from "./client-app-definition";
import { defaultHardcodedAppCreationTime } from "./default-hardcoded-app-creation-time";
import {
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  SCHEMAVAULTS_MAIL_APP_DEFINITION,
  SCHEMAVAULTS_WEB,
  SCHEMAVAULTS_REGISTRY_FRONTEND,
} from "./hardcoded-core-schemavaults-apps";

export const SCHEMAVAULTS_WEB_APP_DEVELOPMENT_DOMAIN = {
  app_domain_ref_id: "17546803-f105-42f4-bee2-13b2513eb48e",
  app_id: SCHEMAVAULTS_WEB.app_id,
  domain: "http://localhost:3000",
  environment: "development",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

export const SCHEMAVAULTS_WEB_APP_PRODUCTION_DOMAIN = {
  app_domain_ref_id: "41d3dc3f-2d46-437c-9035-1be4df3d1dca",
  app_id: SCHEMAVAULTS_WEB.app_id,
  domain: "https://schemavaults.com",
  environment: "production",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

export const SCHEMAVAULTS_WEB_APP_TEST_DOMAIN = {
  app_domain_ref_id: "903b8931-e400-4d71-b9dd-2d767268e7c4",
  app_id: SCHEMAVAULTS_WEB.app_id,
  domain: "http://schemavaults-web",
  environment: "test",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

export const SCHEMAVAULTS_WEB_APP_STAGING_DOMAIN = {
  app_domain_ref_id: "55f8e59f-7d6f-426c-9251-51cd3026328e",
  app_id: SCHEMAVAULTS_WEB.app_id,
  domain: "https://staging.schemavaults.com",
  environment: "staging",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

const HARDCODED_CORE_SCHEMAVAULTS_WEB_APP_DOMAINS = [
  SCHEMAVAULTS_WEB_APP_DEVELOPMENT_DOMAIN,
  SCHEMAVAULTS_WEB_APP_PRODUCTION_DOMAIN,
  SCHEMAVAULTS_WEB_APP_TEST_DOMAIN,
  SCHEMAVAULTS_WEB_APP_STAGING_DOMAIN,
] as const;

export const SCHEMAVAULTS_AUTH_APP_PRODUCTION_DOMAIN = {
  app_domain_ref_id: "539e8ff5-cc5a-4674-9053-d3f12ba3b497",
  app_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
  domain: "https://auth.schemavaults.com",
  environment: "production",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

export const SCHEMAVAULTS_AUTH_APP_DEVELOPMENT_DOMAIN = {
  app_domain_ref_id: "0c6e6234-2974-45d7-8c13-883b21053acb",
  app_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
  domain: "http://localhost:6767",
  environment: "development",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

export const SCHEMAVAULTS_AUTH_APP_TEST_DOMAIN = {
  app_domain_ref_id: "2cffcc0a-0ce8-488c-9dc3-8ea5f1146594",
  app_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
  domain: "http://schemavaults-auth",
  environment: "test",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

export const SCHEMAVAULTS_AUTH_APP_STAGING_DOMAIN = {
  app_domain_ref_id: "e90f04e5-2bab-4a11-ac56-b2c336ea993a",
  app_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
  domain: "https://auth-staging.schemavaults.com",
  environment: "staging",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

const HARDCODED_CORE_SCHEMAVAULTS_AUTH_APP_DOMAINS = [
  SCHEMAVAULTS_AUTH_APP_PRODUCTION_DOMAIN,
  SCHEMAVAULTS_AUTH_APP_DEVELOPMENT_DOMAIN,
  SCHEMAVAULTS_AUTH_APP_TEST_DOMAIN,
  SCHEMAVAULTS_AUTH_APP_STAGING_DOMAIN,
] as const;

export const SCHEMAVAULTS_MAIL_APP_PRODUCTION_DOMAIN = {
  app_domain_ref_id: "4a4dd0be-9e11-4880-be6c-9867137caac5",
  app_id: SCHEMAVAULTS_MAIL_APP_DEFINITION.app_id,
  domain: "https://mail.schemavaults.com",
  environment: "production",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

export const SCHEMAVAULTS_MAIL_APP_DEVELOPMENT_DOMAIN = {
  app_domain_ref_id: "1ed4cea6-d184-4a19-a806-3c227b1beed7",
  app_id: SCHEMAVAULTS_MAIL_APP_DEFINITION.app_id,
  domain: "http://localhost:5346",
  environment: "development",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

export const SCHEMAVAULTS_MAIL_APP_TEST_DOMAIN = {
  app_domain_ref_id: "dae9b071-894c-4060-a08a-5a693966a34b",
  app_id: SCHEMAVAULTS_MAIL_APP_DEFINITION.app_id,
  domain: "http://schemavaults-mail",
  environment: "test",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

export const SCHEMAVAULTS_MAIL_APP_STAGING_DOMAIN = {
  app_domain_ref_id: "34c1fdf5-e7d6-4858-b4f5-027eeb008fc6",
  app_id: SCHEMAVAULTS_MAIL_APP_DEFINITION.app_id,
  domain: "https://mail-staging.schemavaults.com",
  environment: "staging",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

const HARDCODED_CORE_SCHEMAVAULTS_MAIL_APP_DOMAINS = [
  SCHEMAVAULTS_MAIL_APP_PRODUCTION_DOMAIN,
  SCHEMAVAULTS_MAIL_APP_DEVELOPMENT_DOMAIN,
  SCHEMAVAULTS_MAIL_APP_TEST_DOMAIN,
  SCHEMAVAULTS_MAIL_APP_STAGING_DOMAIN,
] as const;

export const SCHEMAVAULTS_REGISTRY_APP_PRODUCTION_DOMAIN = {
  app_domain_ref_id: "3b7532a4-9b69-4265-b987-b04892384301",
  app_id: SCHEMAVAULTS_REGISTRY_FRONTEND.app_id,
  domain: "https://registry.schemavaults.com",
  environment: "production",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

export const SCHEMAVAULTS_REGISTRY_APP_DEVELOPMENT_DOMAIN = {
  app_domain_ref_id: "d6fc22a2-5f43-4e4b-bd42-4626f4b66190",
  app_id: SCHEMAVAULTS_REGISTRY_FRONTEND.app_id,
  domain: "http://localhost:8080",
  environment: "development",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

export const SCHEMAVAULTS_REGISTRY_APP_TEST_DOMAIN = {
  app_domain_ref_id: "a0e284eb-793a-424a-80d0-d4fa87eef4b7",
  app_id: SCHEMAVAULTS_REGISTRY_FRONTEND.app_id,
  domain: "http://schemavaults-registry",
  environment: "test",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

export const SCHEMAVAULTS_REGISTRY_APP_STAGING_DOMAIN = {
  app_domain_ref_id: "d5cae3e9-58cb-41d8-9edc-6e61148272dc",
  app_id: SCHEMAVAULTS_REGISTRY_FRONTEND.app_id,
  domain: "https://registry-staging.schemavaults.com",
  environment: "staging",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsAppDomainRef;

const HARDCODED_CORE_SCHEMAVAULTS_REGISTRY_APP_DOMAINS = [
  SCHEMAVAULTS_REGISTRY_APP_PRODUCTION_DOMAIN,
  SCHEMAVAULTS_REGISTRY_APP_DEVELOPMENT_DOMAIN,
  SCHEMAVAULTS_REGISTRY_APP_TEST_DOMAIN,
  SCHEMAVAULTS_REGISTRY_APP_STAGING_DOMAIN,
] as const;

export const HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS = [
  ...HARDCODED_CORE_SCHEMAVAULTS_WEB_APP_DOMAINS,
  ...HARDCODED_CORE_SCHEMAVAULTS_AUTH_APP_DOMAINS,
  ...HARDCODED_CORE_SCHEMAVAULTS_MAIL_APP_DOMAINS,
  ...HARDCODED_CORE_SCHEMAVAULTS_REGISTRY_APP_DOMAINS,
] as const satisfies readonly SchemaVaultsAppDomainRef[];

export default HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS;
