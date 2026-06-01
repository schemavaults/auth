"use client";

import { type ReactElement } from "react";
import useSWR from "swr";
import { Badge } from "@schemavaults/ui";
import { Loader2 } from "lucide-react";
import {
  isValidMfaFactorType,
  type MfaFactorType,
} from "@schemavaults/auth-common";

function factorTypeLabel(t: MfaFactorType): string {
  switch (t) {
    case "totp":
      return "TOTP";
    case "webauthn":
      return "Passkey";
    default: {
      const _exhaustive: never = t;
      return _exhaustive;
    }
  }
}

async function fetchFactorTypes(uid: string): Promise<readonly MfaFactorType[]> {
  const response = await fetch(`/api/admin/users/${uid}/mfa`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok || response.status !== 200) {
    throw new Error(
      `Failed to load MFA factor types (response status: ${response.status})`,
    );
  }
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !("success" in body) ||
    !body.success ||
    !("data" in body) ||
    typeof body.data !== "object" ||
    !body.data ||
    !("factor_types" in body.data) ||
    !Array.isArray(body.data.factor_types)
  ) {
    throw new Error("Received failure response when fetching MFA factor types");
  }
  const factor_types: MfaFactorType[] = [];
  for (const value of body.data.factor_types) {
    if (isValidMfaFactorType(value)) {
      factor_types.push(value);
    }
  }
  return factor_types;
}

export interface UserMfaFactorsCellProps {
  uid: string;
}

export function UserMfaFactorsCell({
  uid,
}: UserMfaFactorsCellProps): ReactElement {
  const { data, error, isLoading } = useSWR<readonly MfaFactorType[], Error>(
    `/api/admin/users/${uid}/mfa`,
    () => fetchFactorTypes(uid),
    {
      revalidateOnFocus: false,
    },
  );

  if (isLoading && !data) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }
  if (error || !data) {
    return <span className="text-muted-foreground">?</span>;
  }
  if (data.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {data.map((factor) => (
        <Badge key={factor} variant="secondary">
          {factorTypeLabel(factor)}
        </Badge>
      ))}
    </div>
  );
}

export default UserMfaFactorsCell;
