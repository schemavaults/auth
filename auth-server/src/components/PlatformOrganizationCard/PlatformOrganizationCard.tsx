"use client";

import type { ReactElement } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@schemavaults/ui";
import { useAuthUiOwnerOrganizationId } from "@schemavaults/auth-ui";
import { DetailRow } from "@/components/DetailRow";

export interface PlatformOrganizationCardProps {
  cardClassName?: string;
}

/**
 * @description Read-only view of the deployment's platform (owner)
 * organization. The id comes from the `SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION`
 * environment variable, resolved by the root layout into the
 * `useAuthUiOwnerOrganizationId()` context, so it cannot be edited here.
 */
export function PlatformOrganizationCard(
  props: PlatformOrganizationCardProps,
): ReactElement {
  const platformOrganizationId: string = useAuthUiOwnerOrganizationId();

  return (
    <Card
      className={cn("w-full", props.cardClassName)}
      data-testid="platform-organization-card"
    >
      <CardHeader>
        <CardTitle>Platform Organization</CardTitle>
        <CardDescription>
          The organization that owns this deployment&apos;s platform-owned apps
          and API servers. It is set by the{" "}
          <code>SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION</code> environment
          variable and cannot be changed here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DetailRow
          label="Organization ID"
          value={
            <code data-testid="platform-organization-id">
              {platformOrganizationId}
            </code>
          }
        />
      </CardContent>
    </Card>
  );
}
