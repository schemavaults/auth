import type { SchemaVaultsApiServerDomainRef } from "./api-server-definition";
import { defaultHardcodedAppCreationTime } from "./default-hardcoded-app-creation-time";
import {
  SCHEMAVAULTS_MAIL_SERVER,
  SCHEMAVAULTS_REGISTRY_SERVER,
} from "./hardcoded-core-schemavaults-api-servers";

export const SCHEMAVAULTS_REGISTRY_SERVER_DEVELOPMENT_DOMAIN = {
  api_server_domain_ref_id: "b056acd9-0b56-4e11-9d32-ac36036c414f",
  api_server_id: SCHEMAVAULTS_REGISTRY_SERVER.api_server_id,
  domain: "http://localhost:8080",
  environment: "development",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsApiServerDomainRef;

export const SCHEMAVAULTS_REGISTRY_SERVER_TEST_DOMAIN = {
  api_server_domain_ref_id: "13fe64de-67c5-41a8-9ceb-a80a2c68123f",
  api_server_id: SCHEMAVAULTS_REGISTRY_SERVER.api_server_id,
  domain: "http://schemavaults-registry",
  environment: "test",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsApiServerDomainRef;

export const SCHEMAVAULTS_REGISTRY_SERVER_STAGING_DOMAIN = {
  api_server_domain_ref_id: "b3d96099-299a-49af-86eb-1b5e34d9b56b",
  api_server_id: SCHEMAVAULTS_REGISTRY_SERVER.api_server_id,
  domain: "https://registry-staging.schemavaults.com",
  environment: "staging",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsApiServerDomainRef;

export const SCHEMAVAULTS_REGISTRY_SERVER_PRODUCTION_DOMAIN = {
  api_server_domain_ref_id: "f1ebac97-9869-422b-ad83-fbbb13642cad",
  api_server_id: SCHEMAVAULTS_REGISTRY_SERVER.api_server_id,
  domain: "https://api.schemavaults.com",
  environment: "production",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsApiServerDomainRef;

export const HARDCODED_SCHEMAVAULTS_REGISTRY_SERVER_DOMAINS = [
  SCHEMAVAULTS_REGISTRY_SERVER_DEVELOPMENT_DOMAIN,
  SCHEMAVAULTS_REGISTRY_SERVER_TEST_DOMAIN,
  SCHEMAVAULTS_REGISTRY_SERVER_STAGING_DOMAIN,
  SCHEMAVAULTS_REGISTRY_SERVER_PRODUCTION_DOMAIN,
] as const;

export const SCHEMAVAULTS_MAIL_SERVER_DEVELOPMENT_DOMAIN = {
  api_server_domain_ref_id: "7e1781b4-5f8b-4f63-9c8b-7df1e6e20384",
  api_server_id: SCHEMAVAULTS_MAIL_SERVER.api_server_id,
  domain: "http://localhost:5346",
  environment: "development",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsApiServerDomainRef;

export const SCHEMAVAULTS_MAIL_SERVER_TEST_DOMAIN = {
  api_server_domain_ref_id: "7c824625-0d56-4131-94b9-816f0b00267c",
  api_server_id: SCHEMAVAULTS_MAIL_SERVER.api_server_id,
  domain: "http://schemavaults-mail",
  environment: "test",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsApiServerDomainRef;

export const SCHEMAVAULTS_MAIL_SERVER_STAGING_DOMAIN = {
  api_server_domain_ref_id: "9ffcff5a-7800-402b-b361-a3fdf6e36dcc",
  api_server_id: SCHEMAVAULTS_MAIL_SERVER.api_server_id,
  domain: "https://mail-staging.schemavaults.com",
  environment: "staging",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsApiServerDomainRef;

export const SCHEMAVAULTS_MAIL_SERVER_PRODUCTION_DOMAIN = {
  api_server_domain_ref_id: "97178de1-96d5-44dd-a7eb-3dd39e0f3fa5",
  api_server_id: SCHEMAVAULTS_MAIL_SERVER.api_server_id,
  domain: "https://mail.schemavaults.com",
  environment: "production",
  hardcoded: true,
  created_at: defaultHardcodedAppCreationTime,
} as const satisfies SchemaVaultsApiServerDomainRef;

export const HARDCODED_SCHEMAVAULTS_MAIL_SERVER_DOMAINS = [
  SCHEMAVAULTS_MAIL_SERVER_DEVELOPMENT_DOMAIN,
  SCHEMAVAULTS_MAIL_SERVER_TEST_DOMAIN,
  SCHEMAVAULTS_MAIL_SERVER_STAGING_DOMAIN,
  SCHEMAVAULTS_MAIL_SERVER_PRODUCTION_DOMAIN,
] as const;

export const HARDCODED_CORE_SCHEMAVAULTS_API_SERVER_DOMAINS = [
  ...HARDCODED_SCHEMAVAULTS_REGISTRY_SERVER_DOMAINS,
  ...HARDCODED_SCHEMAVAULTS_MAIL_SERVER_DOMAINS,
];

HARDCODED_CORE_SCHEMAVAULTS_API_SERVER_DOMAINS satisfies readonly SchemaVaultsApiServerDomainRef[];
