import type { OrganizationID } from "@schemavaults/auth-common";
import type { OrganizationMfaGracePeriodReason } from "@/lib/organization-mfa-requirements/policy";

export interface OrganizationMfaRequirement {
  organization_id: OrganizationID;
  grace_period_days: number;
  required_since: number;
  updated_at: number;
  updated_by: string | null;
}

export interface OrganizationMfaGracePeriod {
  organization_id: OrganizationID;
  uid: string;
  reason: OrganizationMfaGracePeriodReason;
  started_at: number;
  ends_at: number;
  notified_at: number | null;
}
