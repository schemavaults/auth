"use client";

import { useState, type ReactElement } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
} from "@schemavaults/ui";
import InviteCodesTable from "@/components/InviteCodesTable";
import type { InviteCodeDefinition } from "@schemavaults/auth-common";
import CreateInviteCodeDialog, {
  CreateInviteCodeDialogDispatchContext,
} from "@/components/CreateInviteCodeDialog";

export interface InviteCodesCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly InviteCodeDefinition[];
}

export function InviteCodesCard(props: InviteCodesCardProps): ReactElement {
  const cardTitle = props.cardTitle ?? "Invite Codes";
  const cardDescription =
    props.cardDescription ??
    "View and manage what invite codes are available for new users to register with.";
  const [createInviteCodeDialogOpen, setCreateInviteCodeDialogOpen] =
    useState<boolean>(false);
  const cardClassName: string = cn("w-full", props.cardClassName);

  return (
    <CreateInviteCodeDialogDispatchContext.Provider
      value={setCreateInviteCodeDialogOpen}
    >
      <Card className={cardClassName}>
        <CardHeader>
          <CardTitle>{cardTitle}</CardTitle>
          <CardDescription>{cardDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteCodesTable preloaded={props.preloaded} />
        </CardContent>
        <CardFooter>
          <div className="flex flex-row items-start justify-start gap-2"></div>
        </CardFooter>
      </Card>
      <CreateInviteCodeDialog
        open={createInviteCodeDialogOpen}
        onOpenChange={setCreateInviteCodeDialogOpen}
      />
    </CreateInviteCodeDialogDispatchContext.Provider>
  );
}
