"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import {
  resolveResourceOwnership,
  type ResourceOwnership,
  type ResourceOwnershipFields,
} from "@schemavaults/app-definitions";
import { useCurrentUser } from "@schemavaults/auth-react-provider";
import { Building2, Server, User as UserIcon } from "lucide-react";
import { cn } from "@schemavaults/ui";
import { useAuthUiOwnerOrganizationId } from "@/components/OwnerOrganizationProvider";
import { useAuthUiFriendlyName } from "@/components/FriendlyNameProvider";

export interface ResourceOwnerLabelProps {
  /** The app or API server definition whose owner should be displayed. */
  resource: ResourceOwnershipFields;
  className?: string;
}

/**
 * @description Resolves the ownership of an app/API server definition in
 * browser code, using the platform owner organization id from context (the
 * env var is not available in client bundles).
 */
export function useResolvedResourceOwnership(
  resource: ResourceOwnershipFields,
): ResourceOwnership | null {
  const platformOrganizationId: string = useAuthUiOwnerOrganizationId();
  try {
    return resolveResourceOwnership(resource, {
      platform_owner_organization_id: platformOrganizationId,
    });
  } catch (e: unknown) {
    console.error("Failed to resolve resource ownership: ", e);
    return null;
  }
}

/**
 * @description Renders who owns a client application or API server: the
 * platform (with the auth server's friendly name), an organization (linked
 * to its page), or a user account ("You" for the current user).
 */
export function ResourceOwnerLabel({
  resource,
  className,
}: ResourceOwnerLabelProps): ReactElement {
  const ownership = useResolvedResourceOwnership(resource);
  const currentUser = useCurrentUser();
  const friendlyName: string = useAuthUiFriendlyName();

  const wrapperClassName = cn(
    "inline-flex flex-row flex-nowrap items-center gap-2",
    className,
  );

  if (!ownership) {
    return <span className={cn(wrapperClassName, "text-destructive")}>Unknown owner</span>;
  }

  switch (ownership.owner_type) {
    case "platform":
      return (
        <span
          className={wrapperClassName}
          title={`Owned by the ${friendlyName} platform (${ownership.owner_organization_id})`}
          data-owner-type="platform"
        >
          <Server className="h-4 w-4 text-muted-foreground" />
          <span>{friendlyName}</span>
        </span>
      );
    case "organization":
      return (
        <Link
          href={`/orgs/${ownership.owner_organization_id}`}
          className={cn(wrapperClassName, "hover:underline text-primary")}
          title="Owned by an organization"
          data-owner-type="organization"
        >
          <Building2 className="h-4 w-4" />
          <span>{ownership.owner_organization_id}</span>
        </Link>
      );
    case "user": {
      const isCurrentUser: boolean =
        !!currentUser && currentUser.uid === ownership.owner_uid;
      return (
        <span
          className={wrapperClassName}
          title={`Owned by user ${ownership.owner_uid}`}
          data-owner-type="user"
        >
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <span>{isCurrentUser ? "You" : ownership.owner_uid}</span>
        </span>
      );
    }
  }
}

export default ResourceOwnerLabel;
