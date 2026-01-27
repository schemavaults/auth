"use client";

import type { ReactElement } from "react";
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
import {
  inviteCodeDefinitionSchema,
  type InviteCodeDefinition,
} from "@schemavaults/auth-common";
import useSWR from "swr";

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

  const cardClassName: string = cn("w-full", props.cardClassName);

  const listAllInviteCodesEndpoint = "/api/admin/invite-codes";

  const invite_codes = useSWR(
    listAllInviteCodesEndpoint,
    async (): Promise<readonly InviteCodeDefinition[]> => {
      try {
        const response = await fetch(listAllInviteCodesEndpoint, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok || response.status !== 200) {
          throw new Error(
            `Failed to list invite codes (response status: ${response.status})!`,
          );
        }
        const body: unknown = await response.json();
        if (
          typeof body !== "object" ||
          !body ||
          !("success" in body) ||
          !body.success
        ) {
          throw new Error(
            "Received failure response when attempting to list invite codes",
          );
        }
        if (
          !("data" in body) ||
          typeof body.data !== "object" ||
          !body.data ||
          !("invite_codes" in body.data) ||
          !Array.isArray(body.data.invite_codes)
        ) {
          throw new Error(
            "Failed to extract 'invite_codes' array from response!",
          );
        }
        const parsed_invite_codes = await inviteCodeDefinitionSchema
          .array()
          .safeParseAsync(body.data.invite_codes);

        if (!parsed_invite_codes.success) {
          console.error(
            `Failed to parse 'invite_codes' from response object: `,
            parsed_invite_codes.error,
          );
          throw new Error(
            "Failed to parse 'invite_codes' from response object!",
          );
        }

        const invite_codes: readonly InviteCodeDefinition[] =
          parsed_invite_codes.data;
        return invite_codes;
      } catch (e: unknown) {
        console.error(`Failed to list invite codes: `, e);
        throw new Error(`Failed to list invite codes!`);
      }
    },
    {
      fallbackData: props.preloaded,
    },
  );

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <InviteCodesTable invite_codes={invite_codes} />
      </CardContent>
      <CardFooter>
        <div className="flex flex-row items-start justify-start gap-2"></div>
      </CardFooter>
    </Card>
  );
}
