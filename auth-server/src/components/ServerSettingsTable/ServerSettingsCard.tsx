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
import { ServerSettingsTable } from "./ServerSettingsTable";
import { useServerSettings } from "./useServerSettings";
import type { ServerSettingRecord } from "@/lib/auth-db/server-settings/types";

export interface ServerSettingsCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly ServerSettingRecord[];
}

export function ServerSettingsCard(props: ServerSettingsCardProps): ReactElement {
  const cardTitle = props.cardTitle ?? "Server Settings";
  const cardDescription =
    props.cardDescription ??
    "View and manage server configuration settings.";

  const cardClassName: string = cn("w-full", props.cardClassName);

  const settings = useServerSettings({
    initialData: props.preloaded,
  });

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ServerSettingsTable settings={settings} />
      </CardContent>
    </Card>
  );
}

export default ServerSettingsCard;
