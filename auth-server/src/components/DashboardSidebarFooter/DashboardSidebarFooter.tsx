"use client";

import {
  cn,
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipTrigger,
  type ICustomizableDashboardLayoutComponentProps,
} from "@schemavaults/ui";
import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

/**
 * @description The page that ends the session: it revokes the refresh token
 * through `POST /api/auth/logout/{auth server app id}`, clears the auth
 * provider's caches and sends the user on (the account card's
 * `<SignOutButton />` goes there too).
 */
export const DASHBOARD_SIDEBAR_LOGOUT_HREF = "/auth/logout" as const;

const LOGOUT_LABEL = "Log out" as const;

/**
 * @description The authenticated dashboard sidebar's footer (DashboardLayout's
 * `sidebarFooterContent`): a "Log out" row pinned beneath the menu, so signing
 * out is one click away on every dashboard page.
 *
 * Laid out like the menu rows above it: the icon sits in a column as wide as
 * the collapsed sidebar, so it stays put as the sidebar expands and collapses,
 * and the label shows only while the sidebar is open (always on the mobile
 * sidebar). While collapsed, the label stays in the DOM for screen readers and
 * a tooltip shows it instead. Not red: in this sidebar, red marks admin-only
 * links.
 *
 * Passed to DashboardLayout by reference (not as an inline function), so the
 * layout renders the same component on every render instead of remounting it.
 */
export function DashboardSidebarFooter({
  useDashboardSidebarOpenState,
  useDashboardSidebarSizing,
}: ICustomizableDashboardLayoutComponentProps): ReactElement {
  const { open, mobile } = useDashboardSidebarOpenState();
  const sizes = useDashboardSidebarSizing();
  const showLabel: boolean = mobile === true || open;

  return (
    <div className="py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={DASHBOARD_SIDEBAR_LOGOUT_HREF}
            // Nothing to gain from prefetching the logout page on every
            // dashboard page; it only loads once the user asks to leave.
            prefetch={false}
            data-testid="dashboard-sidebar-logout-link"
            className={cn(
              "flex flex-row flex-nowrap justify-start items-center",
              "w-full overflow-hidden",
              sizes.sidebar_menu_item_height_classname,
              "text-foreground hover:bg-accent transition-colors",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex-shrink-0 flex items-center justify-center",
                sizes.desktop_collapsed_width_classname,
              )}
            >
              <LogOut className="h-6 w-6" />
            </span>
            <span className={cn("text-nowrap", !showLabel && "sr-only")}>
              {LOGOUT_LABEL}
            </span>
          </Link>
        </TooltipTrigger>
        {!showLabel && (
          <TooltipContent side="right">
            {LOGOUT_LABEL}
            <TooltipArrow />
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  );
}

export default DashboardSidebarFooter;
