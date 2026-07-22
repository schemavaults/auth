"use client";

import { Loader2 } from "lucide-react";
import { useApiServerDomains } from "./useApiServerDomains";
import type { ReactElement } from "react";
import type { SchemaVaultsApiServerDomainRef } from "@schemavaults/app-definitions";
import { useAuth } from "@schemavaults/auth-react-provider";

export interface ApiServerDomainsListProps {
  api_server_id: string;
  preloaded_domains?: readonly SchemaVaultsApiServerDomainRef[] | undefined;
}

export function ApiServerDomainsList({
  api_server_id,
  preloaded_domains,
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

  if (!apiServerDomains.data || !Array.isArray(apiServerDomains.data)) {
    return <Loader2 className="animate-spin" />;
  }

  if (apiServerDomains.data.length === 0) {
    return <p className="text-slate-300 font-light">No domains found</p>;
  }

  return (
    <ul>
      {apiServerDomains.data.map((apiServerDomain) => {
        return (
          <li
            className="text-foreground"
            key={`api-server-domain-ref-${apiServerDomain.api_server_domain_ref_id}`}
          >
            {apiServerDomain.domain}
          </li>
        );
      })}
    </ul>
  );
}

export default ApiServerDomainsList;
