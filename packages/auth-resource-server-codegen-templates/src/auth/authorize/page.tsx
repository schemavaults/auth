"use client";

import { useMemo, type ReactElement } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingPage, useToast } from "@schemavaults/ui";
import {
  type ISchemaVaultsAuthClient,
  type SchemaVaultsAppEnvironment,
  useAppEnvironment,
  useAuth,
  useTradeAuthorizationCodeForTokensEffect,
} from "@schemavaults/auth-react-provider";

interface ExchangeAuthCodeForTokensManagerComponentProps {
  auth: ISchemaVaultsAuthClient;
}

const backHref = "/";

function ExchangeAuthCodeForTokensManagerComponent({
  auth,
}: ExchangeAuthCodeForTokensManagerComponentProps): ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  useTradeAuthorizationCodeForTokensEffect({
    router,
    searchParams,
    auth,
    toast,
    debug: environment !== "production",
  });

  return (
    <>
      <LoadingPage message="Trading authorization code & proof code for tokens..." />
    </>
  );
}

export default function AuthorizePage(): ReactElement {
  const auth = useAuth();

  if (!auth || !auth.ready || !auth.client || !auth.client.current) {
    return (
      <>
        <LoadingPage message="Loading auth client..." />
      </>
    );
  }

  const authClient: ISchemaVaultsAuthClient = auth.client.current;

  return <ExchangeAuthCodeForTokensManagerComponent auth={authClient} />;
}
