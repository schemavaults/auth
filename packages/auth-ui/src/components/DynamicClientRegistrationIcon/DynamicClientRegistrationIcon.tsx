"use client";

import type { ReactElement } from "react";
import type { ResourceOwnershipFields } from "@schemavaults/app-definitions";
import { Bot } from "lucide-react";
import { cn } from "@schemavaults/ui";
import { useResolvedResourceOwnership } from "@/components/ResourceOwnerLabel";

/** Accessible name of {@link DynamicClientRegistrationIcon}. */
export const DYNAMIC_CLIENT_REGISTRATION_ICON_LABEL =
  "Dynamically registered client" as const;

/** Default hover text of {@link DynamicClientRegistrationIcon}. */
export const DYNAMIC_CLIENT_REGISTRATION_ICON_TITLE =
  "Registered anonymously through OAuth 2.0 dynamic client registration (RFC 7591). Its name, description and metadata were supplied by the client and are not verified." as const;

/**
 * @description Whether a client application was registered anonymously
 * through RFC 7591 dynamic client registration (e.g. an MCP client such as
 * Claude), resolved in browser code with the platform owner organization
 * from context.
 */
export function useIsDynamicallyRegisteredClient(
  resource: ResourceOwnershipFields,
): boolean {
  return (
    useResolvedResourceOwnership(resource)?.owner_type ===
    "dynamic-client-registration"
  );
}

export interface DynamicClientRegistrationIconProps {
  className?: string;
  /** Classes of the robot glyph itself (default size `h-4 w-4`). */
  iconClassName?: string;
  /** Hover text; defaults to {@link DYNAMIC_CLIENT_REGISTRATION_ICON_TITLE}. */
  title?: string;
}

/**
 * @description Robot marker for a client application registered through
 * dynamic client registration, so such self-registered clients stand out
 * next to the ones created in the console. Render it only for those apps
 * (see {@link useIsDynamicallyRegisteredClient}).
 */
export function DynamicClientRegistrationIcon({
  className,
  iconClassName,
  title = DYNAMIC_CLIENT_REGISTRATION_ICON_TITLE,
}: DynamicClientRegistrationIconProps): ReactElement {
  return (
    <span
      role="img"
      aria-label={DYNAMIC_CLIENT_REGISTRATION_ICON_LABEL}
      title={title}
      data-dynamic-client-registration-icon=""
      className={cn(
        "inline-flex shrink-0 items-center",
        className,
      )}
    >
      <Bot className={cn("h-4 w-4", iconClassName)} aria-hidden="true" />
    </span>
  );
}

export default DynamicClientRegistrationIcon;
