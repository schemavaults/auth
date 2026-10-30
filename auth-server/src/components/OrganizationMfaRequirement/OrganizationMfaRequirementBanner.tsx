"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useCurrentUser } from "@schemavaults/auth-react-provider";
import { Button, cn } from "@schemavaults/ui";
import { ShieldAlert } from "lucide-react";
import type { MyOrganizationMfaRequirementView } from "@/lib/organization-mfa-requirements/types";

export const MY_ORGANIZATION_MFA_REQUIREMENTS_ENDPOINT = "/api/me/organization-mfa-requirements";

const UNMET_REFRESH_INTERVAL_MS = 30_000;

async function fetchMyOrganizationMfaRequirements(): Promise<readonly MyOrganizationMfaRequirementView[]> {
  const response = await fetch(MY_ORGANIZATION_MFA_REQUIREMENTS_ENDPOINT, {
    method: "GET",
    credentials: "include",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !Array.isArray(body.data?.organizations)) {
    throw new Error(`Failed to list the organizations that require MFA (status: ${response.status})`);
  }
  return body.data.organizations;
}

function RequirementLine({ requirement }: { requirement: MyOrganizationMfaRequirementView }): ReactElement {
  const name = <strong>{requirement.organization_name}</strong>;
  if (requirement.status === "expired") {
    return (
      <li>
        Your membership of {name} is suspended: its grace period for enabling
        multi-factor authentication ended. Enable it now, before you are
        removed from the organization.
      </li>
    );
  }
  if (requirement.status === "grace_period" && requirement.grace_period_ends_at !== null) {
    return (
      <li>
        {name} requires multi-factor authentication. Enable it before{" "}
        {new Date(requirement.grace_period_ends_at).toLocaleString()} to stay a
        member.
      </li>
    );
  }
  return (
    <li>
      {name} requires multi-factor authentication. Enable it within{" "}
      {requirement.grace_period_days} day{requirement.grace_period_days === 1 ? "" : "s"} to stay a member.
    </li>
  );
}

export interface OrganizationMfaRequirementBannerProps {
  className?: string;
}

/**
 * Shown on every authenticated dashboard page while the signed-in user
 * belongs to organizations that require multi-factor authentication and has
 * none: says until when they can enable it before they are removed (or that
 * their membership is already suspended) and links to the MFA page. Renders
 * nothing otherwise, for service accounts, and when the lookup fails.
 *
 * Styled like <EmailVerificationBanner />: a full-width strip above each
 * page's <PageContainer />.
 */
export function OrganizationMfaRequirementBanner({
  className,
}: OrganizationMfaRequirementBannerProps): ReactElement | null {
  const user = useCurrentUser();
  const { data } = useSWR(
    user && user.service_account !== true ? MY_ORGANIZATION_MFA_REQUIREMENTS_ENDPOINT : null,
    fetchMyOrganizationMfaRequirements,
    {
      // The layout (and so this banner) stays mounted across pages: while a
      // requirement is unmet, poll so enabling MFA on /mfa clears it.
      refreshInterval: (latest?: readonly MyOrganizationMfaRequirementView[]): number =>
        latest?.some((requirement) => requirement.status !== "compliant") ? UNMET_REFRESH_INTERVAL_MS : 0,
    },
  );

  const unmet: readonly MyOrganizationMfaRequirementView[] = (data ?? []).filter(
    (requirement) => requirement.status !== "compliant",
  );
  if (unmet.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      data-testid="organization-mfa-requirement-banner"
      className={cn(
        "flex flex-row flex-wrap items-center justify-between gap-3",
        "shrink-0 border-b border-amber-300 bg-amber-50 text-amber-900",
        "px-4 py-3 text-sm",
        className,
      )}
    >
      <div className="flex flex-row items-start gap-2 min-w-0">
        <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
        <ul className="flex flex-col gap-1 break-words">
          {unmet.map((requirement) => (
            <RequirementLine key={requirement.organization_id} requirement={requirement} />
          ))}
        </ul>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0">
        <Link href="/mfa" data-testid="organization-mfa-requirement-banner-link">
          Set up MFA
        </Link>
      </Button>
    </div>
  );
}

export default OrganizationMfaRequirementBanner;
