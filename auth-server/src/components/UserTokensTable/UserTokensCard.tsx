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
import type { IssuedTokenType } from "@/lib/auth-db/issued-tokens";
import { UserTokensTable } from "./UserTokensTable";
import { useUserTokens } from "./useUserTokens";

export interface UserTokensCardProps {
  uid: string;
  tokenType: IssuedTokenType;
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  "data-testid"?: string;
}

const DEFAULT_TITLES: Record<IssuedTokenType, string> = {
  access: "Access Tokens",
  refresh: "Refresh Tokens",
};

const DEFAULT_DESCRIPTIONS: Record<IssuedTokenType, string> = {
  access:
    "Recently issued access tokens for this user, ordered by issue time (newest first).",
  refresh:
    "Recently issued refresh tokens for this user, ordered by issue time (newest first).",
};

const DATATYPE_LABELS: Record<IssuedTokenType, string> = {
  access: "Access Token",
  refresh: "Refresh Token",
};

export function UserTokensCard({
  uid,
  tokenType,
  cardTitle,
  cardDescription,
  cardClassName,
  "data-testid": dataTestId,
}: UserTokensCardProps): ReactElement {
  const tokens = useUserTokens({ uid, tokenType });

  return (
    <Card
      className={cn("w-full", cardClassName)}
      data-testid={dataTestId ?? `admin-user-${tokenType}-tokens-card`}
    >
      <CardHeader>
        <CardTitle>{cardTitle ?? DEFAULT_TITLES[tokenType]}</CardTitle>
        <CardDescription>
          {cardDescription ?? DEFAULT_DESCRIPTIONS[tokenType]}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <UserTokensTable
          tokens={tokens}
          datatypeLabel={DATATYPE_LABELS[tokenType]}
        />
      </CardContent>
    </Card>
  );
}

export default UserTokensCard;
