"use client";

import { useState, type ReactElement } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@schemavaults/ui";
import OrganizationsTable from "@/components/OrganizationsTable";
import type { OrganizationDefinition } from "@schemavaults/auth-common";
import CreateOrganizationDialog, {
  CreateOrganizationDialogDispatchContext,
} from "@/components/CreateOrganizationDialog";

export interface OrganizationsCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly OrganizationDefinition[];
}

export function OrganizationsCard(props: OrganizationsCardProps): ReactElement {
  const cardTitle = props.cardTitle ?? "Organizations";
  const cardDescription =
    props.cardDescription ?? "View and manage organizations.";
  const [createOrganizationDialogOpen, setCreateOrganizationDialogOpen] =
    useState<boolean>(false);
  const cardClassName: string = cn("w-full", props.cardClassName);

  return (
    <CreateOrganizationDialogDispatchContext.Provider
      value={setCreateOrganizationDialogOpen}
    >
      <Card className={cardClassName}>
        <CardHeader>
          <CardTitle>{cardTitle}</CardTitle>
          <CardDescription>{cardDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationsTable preloaded_organizations={props.preloaded} />
        </CardContent>
      </Card>
      <CreateOrganizationDialog
        open={createOrganizationDialogOpen}
        onOpenChange={setCreateOrganizationDialogOpen}
      />
    </CreateOrganizationDialogDispatchContext.Provider>
  );
}
