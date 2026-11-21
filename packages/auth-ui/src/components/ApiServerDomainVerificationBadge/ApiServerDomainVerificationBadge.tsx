"use client";

import type { FC, ReactElement } from "react";
import type { ApiServerDomainVerification } from "@schemavaults/app-definitions";
import { Badge } from "@schemavaults/ui";
import { ShieldAlert, ShieldCheck } from "lucide-react";

export interface ApiServerDomainVerificationBadgeProps {
  verification: ApiServerDomainVerification;
  /**
   * Whether the deployment requires verified domains (its
   * `require_api_server_domain_verification` setting), which only changes
   * the unverified badge's tooltip. Leave it out where the setting is not
   * known.
   */
  verificationRequired?: boolean | undefined;
}

function describeUnverified(verificationRequired: boolean | undefined): string {
  if (verificationRequired === true) {
    return "Resource URLs on this domain do not resolve to the API server until its ownership is verified";
  }
  if (verificationRequired === false) {
    return "Ownership not verified: resource URLs on this domain still resolve for now, but stop once the deployment requires verification";
  }
  return "Ownership not verified: verify it on the API server's page";
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
 * Shown next to a domain registered for an API server: whether its
 * ownership is verified (DNS TXT record or administrator attestation).
 * Verified domains take precedence in RFC 8707 resource-URL resolution;
 * unverified ones stop resolving once the deployment requires verification.
 * Carries `data-testid="api-server-domain-{verified|unverified}-<ref id>"`.
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
      title={describeUnverified(verificationRequired)}
      data-testid={`api-server-domain-unverified-${verification.api_server_domain_ref_id}`}
    >
      <ShieldAlert className="h-3 w-3" />
      Unverified
    </Badge>
  );
};

export default ApiServerDomainVerificationBadge;
