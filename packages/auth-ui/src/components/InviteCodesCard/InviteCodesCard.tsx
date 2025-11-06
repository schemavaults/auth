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
import {
  ISchemaVaultsAuthClient,
  useAuth,
  useCurrentUser,
} from "@schemavaults/auth-react-provider";
import InviteCodesTable from "@/components/InviteCodesTable";
import {
  inviteCodeDefinitionSchema,
  type InviteCodeDefinition,
} from "@schemavaults/auth-common";
import useSWR from "swr";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";

export interface InviteCodesCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly InviteCodeDefinition[];
}

export function InviteCodesCard(props: InviteCodesCardProps): ReactElement {
  const authClient = useAuth();
  const currentUser = useCurrentUser();

  const cardTitle = props.cardTitle ?? "Invite Codes";
  const cardDescription =
    props.cardDescription ??
    "View and manage what invite codes are available for new users to register with.";

  const cardClassName: string = cn("w-full", props.cardClassName);

  const listAllInviteCodesEndpoint = "/api/admin/invite-codes/list";

  const invite_codes = useSWR(
    listAllInviteCodesEndpoint,
    async (): Promise<readonly InviteCodeDefinition[]> => {
      if (!authClient.ready || !authClient.client.current) {
        throw new Error("Auth client is not ready to list data!");
      }
      const auth: ISchemaVaultsAuthClient = authClient.client.current;

      let jwt: string;
      try {
        const accessToken = await auth.acquireAccessToken({
          audience: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
          token_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
        });
        jwt = accessToken.token;
      } catch (e: unknown) {
        console.error(
          "Failed to acquire access token in order to list invite codes: ",
          e,
        );
        throw new Error(
          "Failed to acquire access token in order to list invite codes!",
        );
      }

      try {
        const response = await fetch(listAllInviteCodesEndpoint, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
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
