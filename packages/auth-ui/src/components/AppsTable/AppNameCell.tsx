"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import {
  DynamicClientRegistrationIcon,
  useIsDynamicallyRegisteredClient,
} from "@/components/DynamicClientRegistrationIcon";
import { LocalDateTime } from "@/lib/LocalDateTime";

export interface AppNameCellProps {
  app: SchemaVaultsApp;
}

/**
 * @description "App Name" cell of the apps table. A dynamically registered
 * client (RFC 7591) gets a robot marker and its registration time below the
 * name: such clients pick their own name (several registrations of the same
 * MCP client all read "Claude"), so the time is what tells them apart.
 */
export function AppNameCell({ app }: AppNameCellProps): ReactElement {
  const dynamicallyRegistered: boolean = useIsDynamicallyRegisteredClient(app);

  const nameLink = (
    <Link href={`/apps/${app.app_id}`} className="hover:underline text-primary">
      {app.app_name}
    </Link>
  );

  if (!dynamicallyRegistered) {
    return nameLink;
  }

  return (
    <div
      className="flex flex-col gap-0.5"
      data-dynamically-registered-client=""
    >
      <span className="inline-flex flex-row flex-nowrap items-center gap-2">
        <DynamicClientRegistrationIcon />
        {nameLink}
      </span>
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        Registered{" "}
        <LocalDateTime value={app.created_at} showSeconds={false} />
      </span>
    </div>
  );
}

export default AppNameCell;
