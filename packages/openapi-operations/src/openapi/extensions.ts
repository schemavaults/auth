import type { OrganizationMembershipRoleType } from "@schemavaults/auth-common/organizations";
import {
  isDelegatedCallerPolicy,
  type DelegatedCallerPolicy,
  type OperationAuth,
  type RouteGuardType,
} from "../auth-scheme";

/**
 * Vendor extension attached to every operation object so API docs can show
 * the SchemaVaults authorization requirements that plain OpenAPI `security`
 * requirements cannot express (route guard level, organization role,
 * whether delegated callers such as agents are accepted).
 */
export const SCHEMAVAULTS_AUTH_EXTENSION = "x-schemavaults-auth" as const;

/** Extra keys on `components.securitySchemes[name]` describing the scheme for docs. */
export const SCHEMAVAULTS_SCHEME_TITLE_EXTENSION = "x-schemavaults-title" as const;
export const SCHEMAVAULTS_SCHEME_CHALLENGE_EXTENSION = "x-schemavaults-challenge" as const;

export interface SchemaVaultsAuthExtension {
  readonly public: boolean;
  /** Names of the accepted security schemes (any one satisfies the operation). */
  readonly schemes: readonly string[];
  readonly routeGuard: RouteGuardType | null;
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
    requiredScopes: [...(auth.requiredScopes ?? [])],
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
