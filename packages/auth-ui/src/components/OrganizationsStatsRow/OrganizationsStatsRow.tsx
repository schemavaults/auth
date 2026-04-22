"use client";

import type { ReactElement } from "react";
import {
  StatCard,
  StatCardHeader,
  StatCardLabel,
  StatCardValue,
  StatCardDescription,
  StatCardIcon,
  cn,
} from "@schemavaults/ui";
import type { OrganizationDefinition } from "@schemavaults/auth-common";
import { Building2 } from "lucide-react";
import { useAllOrganizationsList } from "@/components/OrganizationsTable";

export interface OrganizationsStatsRowProps {
  preloaded?: readonly OrganizationDefinition[];
  className?: string;
}

export function OrganizationsStatsRow(
  props: OrganizationsStatsRowProps,
): ReactElement {
  const organizations = useAllOrganizationsList({
    initialData: props.preloaded,
  });

  const total = organizations.data?.length ?? 0;
  const loading = !organizations.data;

  return (
    <div
      className={cn(
        "grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
        props.className,
      )}
    >
      <StatCard>
        <StatCardHeader>
          <StatCardLabel>Total organizations</StatCardLabel>
          <StatCardIcon>
            <Building2 />
          </StatCardIcon>
        </StatCardHeader>
        <StatCardValue loading={loading}>{total}</StatCardValue>
        <StatCardDescription>
          All organizations visible to admins.
        </StatCardDescription>
      </StatCard>
    </div>
  );
}

export default OrganizationsStatsRow;
