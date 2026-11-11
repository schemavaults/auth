import type { OrganizationMembershipRoleType } from "@schemavaults/auth-common/organizations";
import {
  isDelegatedCallerPolicy,
  type DelegatedCallerPolicy,
  type OperationAuth,
  type RouteGuardType,
} from "../auth-scheme";
import type { DocumentedScope } from "../scopes/collect-scopes";
import { scopeValues } from "../scopes/scope-definition";

/**
 * Vendor extension attached to every operation object so API docs can show
 * the SchemaVaults authorization requirements that plain OpenAPI `security`
 * requirements cannot express (route guard level, organization role,
 * whether delegated callers such as agents are accepted).
 */
export const SCHEMAVAULTS_AUTH_EXTENSION = "x-schemavaults-auth" as const;

/**
 * Document-level vendor extension listing every scope the operations require
 * (plus `buildOpenApiDocument({ additionalScopes })`), each with its
 * description when a `ScopeDefinition` gave one. Plain OpenAPI can only
 * describe scopes inside `oauth2` flows, which bearer-token schemes have
 * none of. Emitted only when there is at least one scope.
 */
export const SCHEMAVAULTS_SCOPES_EXTENSION = "x-schemavaults-scopes" as const;

/** The value of {@link SCHEMAVAULTS_SCOPES_EXTENSION}. */
export type SchemaVaultsScopesExtension = readonly DocumentedScope[];

export function isSchemaVaultsScopesExtension(
  value: unknown,
): value is SchemaVaultsScopesExtension {
  return (
    Array.isArray(value) &&
    value.every(
      (entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).scope === "string" &&
        ((entry as Record<string, unknown>).description === undefined ||
          typeof (entry as Record<string, unknown>).description === "string"),
    )
  );
}

/** Extra keys on `components.securitySchemes[name]` describing the scheme for docs. */
export const SCHEMAVAULTS_SCHEME_TITLE_EXTENSION = "x-schemavaults-title" as const;
export const SCHEMAVAULTS_SCHEME_CHALLENGE_EXTENSION = "x-schemavaults-challenge" as const;

export interface SchemaVaultsAuthExtension {
  readonly public: boolean;
  /** Names of the accepted security schemes (any one satisfies the operation). */
  readonly schemes: readonly string[];
  readonly routeGuard: RouteGuardType | null;
  /** Values of the required scopes; their descriptions are in {@link SCHEMAVAULTS_SCOPES_EXTENSION}. */
  readonly requiredScopes: readonly string[];
  readonly organization: {
    readonly parameter: string;
    readonly roles: readonly OrganizationMembershipRoleType[];
    readonly adminBypass: boolean;
  } | null;
  /**
   * Whether credentials naming an RFC 8693 actor (e.g. an agent acting for
   * the user) are accepted. Present only when the operation declares it;
   * absent means `"allowed"`.
   */
  readonly delegatedCallers?: DelegatedCallerPolicy;
  readonly notes?: string;
}

export function toSchemaVaultsAuthExtension(auth: OperationAuth): SchemaVaultsAuthExtension {
  if (auth.type === "public") {
    return {
      public: true,
      schemes: [],
      routeGuard: null,
      requiredScopes: [],
      organization: null,
      ...(auth.notes !== undefined ? { notes: auth.notes } : {}),
    };
  }
  return {
    public: false,
    schemes: auth.schemes.map((scheme) => scheme.name),
    routeGuard: auth.routeGuard ?? "authenticated",
    requiredScopes: scopeValues(auth.requiredScopes),
    organization: auth.organization
      ? {
          parameter: auth.organization.parameter,
          roles: [...auth.organization.roles],
          adminBypass: auth.organization.adminBypass ?? true,
        }
      : null,
    ...(auth.delegatedCallers !== undefined ? { delegatedCallers: auth.delegatedCallers } : {}),
    ...(auth.notes !== undefined ? { notes: auth.notes } : {}),
  };
}

export function isSchemaVaultsAuthExtension(value: unknown): value is SchemaVaultsAuthExtension {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.public === "boolean" &&
    Array.isArray(record.schemes) &&
    Array.isArray(record.requiredScopes) &&
    (record.routeGuard === null ||
      record.routeGuard === "authenticated" ||
      record.routeGuard === "admin") &&
    (record.delegatedCallers === undefined || isDelegatedCallerPolicy(record.delegatedCallers))
  );
}
