"use client";

import { Loader2 } from "lucide-react";
import { useApiServerDomains } from "./useApiServerDomains";
import { useApiServerDomainVerifications } from "./useApiServerDomainVerifications";
import type { ReactElement } from "react";
import type {
  ApiServerDomainVerification,
  SchemaVaultsApiServerDomainRef,
} from "@schemavaults/app-definitions";
import { useAuth } from "@schemavaults/auth-react-provider";
import { ApiServerDomainVerificationBadge } from "@/components/ApiServerDomainVerificationBadge";

export interface ApiServerDomainsListProps {
  api_server_id: string;
  preloaded_domains?: readonly SchemaVaultsApiServerDomainRef[] | undefined;
  preloaded_domain_verifications?: readonly ApiServerDomainVerification[] | undefined;
}

/**
 * The domains of one API server, each with a Verified / Unverified badge
 * (none while the verification states load, and none for hardcoded API
 * servers, whose domains come from the server's configuration).
 */
export function ApiServerDomainsList({
  api_server_id,
  preloaded_domains,
  preloaded_domain_verifications,
}: ApiServerDomainsListProps): ReactElement {
  const auth = useAuth();
  const authClient = auth.ready ? auth.client.current : undefined;
  const apiServerDomains = useApiServerDomains({
    api_server_id,
    initialData: Array.isArray(preloaded_domains)
      ? preloaded_domains
      : undefined,
    authClient: authClient ?? undefined,
  });
  const verifications = useApiServerDomainVerifications({
    api_server_id,
    initialData: Array.isArray(preloaded_domain_verifications)
      ? preloaded_domain_verifications
      : undefined,
    authClient: authClient ?? undefined,
  });
  const verificationsByRefId = new Map<string, ApiServerDomainVerification>(
    (verifications.data ?? []).map((v) => [v.api_server_domain_ref_id, v]),
  );

  if (!apiServerDomains.data || !Array.isArray(apiServerDomains.data)) {
    return <Loader2 className="animate-spin" />;
  }

  if (apiServerDomains.data.length === 0) {
    return <p className="text-slate-300 font-light">No domains found</p>;
  }

  return (
    <ul>
      {apiServerDomains.data.map((apiServerDomain) => {
        const verification = verificationsByRefId.get(
          apiServerDomain.api_server_domain_ref_id,
        );
        return (
          <li
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground"
            key={`api-server-domain-ref-${apiServerDomain.api_server_domain_ref_id}`}
          >
            <span className="break-all">{apiServerDomain.domain}</span>
            {verification && (
              <ApiServerDomainVerificationBadge verification={verification} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default ApiServerDomainsList;
