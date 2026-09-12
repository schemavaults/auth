import type { ReactElement } from "react";
import { Badge, cn } from "@schemavaults/ui";
import type { ApiDocsAuth } from "@/model/types";

export interface OperationAuthBadgesProps {
  auth: ApiDocsAuth;
  deprecated?: boolean;
  /** Show scope / organization badges too (default true). */
  detailed?: boolean;
  className?: string;
}

/**
 * Compact summary of an operation's access requirements: Public /
 * Authenticated / Admin, plus scope and organization role chips.
 */
export function OperationAuthBadges({
  auth,
  deprecated = false,
  detailed = true,
  className,
}: OperationAuthBadgesProps): ReactElement {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {deprecated ? <Badge variant="destructive">Deprecated</Badge> : null}
      {auth.public ? (
        <Badge variant="secondary">Public</Badge>
      ) : auth.routeGuard === "admin" ? (
        <Badge variant="default">Admin</Badge>
      ) : (
        <Badge variant="outline">Authenticated</Badge>
      )}
      {detailed
        ? auth.requiredScopes.map((scope) => (
            <Badge key={`scope-${scope}`} variant="outline" className="font-mono">
              scope:{scope}
            </Badge>
          ))
        : null}
      {detailed && auth.organization ? (
        <Badge variant="outline">
          org {auth.organization.roles.length > 0 ? auth.organization.roles.join(" / ") : "member"}
        </Badge>
      ) : null}
    </span>
  );
}

export default OperationAuthBadges;
