"use client";

import { Loader2 } from "lucide-react";
import { useAppDomains } from "./useAppDomains"
import type { ReactElement } from "react";
import type { SchemaVaultsAppDomainRef } from "@schemavaults/app-definitions";

export interface AppDomainsListProps {
  app_id: string;
  preloaded_domains?: readonly SchemaVaultsAppDomainRef[] | undefined
}

export function AppDomainsList(
  { app_id, preloaded_domains }: AppDomainsListProps
): ReactElement {
  console.log("[AppDomainsList] component initialized with:", { app_id, preloaded_domains });

  const appDomains = useAppDomains({
    app_id,
    initialData: Array.isArray(preloaded_domains) ? preloaded_domains : undefined
  });

  if (!appDomains.data || !Array.isArray(appDomains.data)) {
    return <Loader2 className="animate-spin" />
  }

  if (appDomains.data.length === 0) {
    return (
      <p className="text-slate-300 font-light">
        No domains found
      </p>
    );
  }

  return (
    <ul>
      {appDomains.data.map(appDomain => {
        return (
          <li
            className="text-foreground"
            key={`app-domain-ref-${appDomain.app_domain_ref_id}`}
          >
            {appDomain.domain}
          </li>
        );
      })}
    </ul>
  );
}
