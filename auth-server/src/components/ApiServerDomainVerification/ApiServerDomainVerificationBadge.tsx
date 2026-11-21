"use client";

import type { FC, ReactElement } from "react";
import type { ApiServerDomainVerification } from "@schemavaults/app-definitions";
import { Badge } from "@schemavaults/ui";
import { ShieldAlert, ShieldCheck } from "lucide-react";

export interface ApiServerDomainVerificationBadgeProps {
  verification: ApiServerDomainVerification;
  /** Whether unverified domains have stopped resolving resource URLs. */
  verificationRequired: boolean;
}

function describeMethod(verification: ApiServerDomainVerification): string {
  switch (verification.verification_method) {
    case "dns_txt":
      return "Verified through its DNS TXT record";
    case "administrator":
      return "Verified by a platform administrator";
    default:
      return "Verified";
  }
}

/**
 * Whether a registered domain's ownership is verified. Verified domains
 * take precedence in RFC 8707 resource-URL resolution; unverified ones stop
 * resolving once the deployment requires verification.
 */
export const ApiServerDomainVerificationBadge: FC<ApiServerDomainVerificationBadgeProps> = ({
  verification,
  verificationRequired,
}): ReactElement => {
  if (verification.verified) {
    return (
      <Badge
        variant="secondary"
        className="gap-1"
        title={describeMethod(verification)}
        data-testid={`api-server-domain-verified-${verification.api_server_domain_ref_id}`}
      >
        <ShieldCheck className="h-3 w-3" />
        Verified
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 text-amber-700 dark:text-amber-400"
      title={
        verificationRequired
          ? "Resource URLs on this domain do not resolve to the API server until its ownership is verified"
          : "Ownership not verified: resource URLs on this domain still resolve for now, but stop once the deployment requires verification"
      }
      data-testid={`api-server-domain-unverified-${verification.api_server_domain_ref_id}`}
    >
      <ShieldAlert className="h-3 w-3" />
      Unverified
    </Badge>
  );
};

export default ApiServerDomainVerificationBadge;
