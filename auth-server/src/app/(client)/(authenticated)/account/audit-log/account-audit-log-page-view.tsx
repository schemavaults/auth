"use client";

import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import { AuditLogCard, MY_AUDIT_LOG_ENDPOINT } from "@/components/AuditLog";
import type { AuditLogPage } from "@/lib/audit-log/audit-log-entry-schema";

export interface AccountAuditLogPageViewProps {
  viewer_uid: string;
  preloaded?: AuditLogPage;
}

export default function AccountAuditLogPageView({
  viewer_uid,
  preloaded,
}: AccountAuditLogPageViewProps): ReactElement {
  return (
    <PageContainer>
      <AuditLogCard
        className="grow"
        endpoint={MY_AUDIT_LOG_ENDPOINT}
        title="Account audit log"
        description="Sign-ins, security changes and other activity on your account, newest first. If something here was not you, reset your password and review your MFA factors."
        emptyMessage="No activity has been recorded for your account yet."
        viewer_uid={viewer_uid}
        showOrganization
        preloaded={preloaded}
      />
    </PageContainer>
  );
}
