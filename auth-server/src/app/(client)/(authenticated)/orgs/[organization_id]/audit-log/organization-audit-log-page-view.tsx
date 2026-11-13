"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@schemavaults/ui";
import PageContainer from "@/components/PageContainer";
import { AuditLogCard, getOrganizationAuditLogEndpoint } from "@/components/AuditLog";
import type { AuditLogPage } from "@/lib/audit-log/audit-log-entry-schema";

export interface OrganizationAuditLogPageViewProps {
  organization_id: string;
  organization_name: string;
  viewer_uid: string;
  preloaded?: AuditLogPage;
}

export default function OrganizationAuditLogPageView({
  organization_id,
  organization_name,
  viewer_uid,
  preloaded,
}: OrganizationAuditLogPageViewProps): ReactElement {
  return (
    <PageContainer>
      <div>
        <Button asChild variant="outline" className="flex flex-row gap-2 flex-nowrap w-fit">
          <Link href={`/orgs/${organization_id}`} data-testid="organization-audit-log-back-link">
            <ArrowLeft className="h-4 w-4" />
            Back to {organization_name}
          </Link>
        </Button>
      </div>
      <AuditLogCard
        className="grow"
        endpoint={getOrganizationAuditLogEndpoint(organization_id)}
        title={`Audit log of ${organization_name}`}
        description="Invitations, membership and role changes, and changes to this organization's MFA requirement, newest first. Visible to the organization's owners."
        emptyMessage="No activity has been recorded for this organization yet."
        viewer_uid={viewer_uid}
        preloaded={preloaded}
      />
    </PageContainer>
  );
}
