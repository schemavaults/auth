"use client";

import type { ReactElement } from "react";
import { Badge } from "@schemavaults/ui";
import { Loader2 } from "lucide-react";
import { useAppEnvironment, useAuth } from "@schemavaults/auth-react-provider";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { useAppCallbackUrls } from "./useAppCallbackUrls";

export interface AppCallbackUrlsListProps {
  app_id: string;
  /** Hardcoded apps have no callback URLs: they are validated by domain. */
  hardcoded: boolean;
}

const NO_CALLBACK_URLS_HINT =
  "Without a callback URL in an environment, a public client cannot sign users in there, and a confidential client accepts any path on its domains.";

/**
 * The "Callback URLs" cell of the apps table: the app's registered
 * callback URLs, each tagged with its environment (the deployment's own
 * environment listed first), loaded asynchronously per row.
 */
export function AppCallbackUrlsList({
  app_id,
  hardcoded,
}: AppCallbackUrlsListProps): ReactElement {
  if (hardcoded) {
    return (
      <span
        className="text-muted-foreground font-light"
        title="Built-in apps are validated against their domains"
      >
        Built-in (by domain)
      </span>
    );
  }
  return <RegisteredCallbackUrls app_id={app_id} />;
}

function RegisteredCallbackUrls({ app_id }: { app_id: string }): ReactElement {
  const auth = useAuth();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const { data, error, isLoading } = useAppCallbackUrls({
    app_id,
    authClient: (auth.ready ? auth.client.current : undefined) ?? undefined,
  });

  if (isLoading && !data) {
    return (
      <Loader2
        className="h-4 w-4 animate-spin text-muted-foreground"
        aria-label="Loading callback URLs"
      />
    );
  }
  if (error || !data) {
    return (
      <span className="text-muted-foreground" title={error?.message}>
        ?
      </span>
    );
  }
  if (data.length === 0) {
    return (
      <span
        className="text-muted-foreground font-light"
        title={NO_CALLBACK_URLS_HINT}
      >
        No callback URLs
      </span>
    );
  }

  // The deployment's own environment first, otherwise in registration order.
  const sorted = [...data].sort(
    (a, b) =>
      Number(b.environment === environment) -
      Number(a.environment === environment),
  );
  return (
    <ul className="flex flex-col gap-1">
      {sorted.map((ref) => (
        <li
          key={ref.app_callback_url_ref_id}
          className="flex items-center gap-2"
        >
          <span className="text-foreground break-all">{ref.callback_url}</span>
          <Badge
            variant={ref.environment === environment ? "secondary" : "outline"}
            className="shrink-0 font-normal"
          >
            {ref.environment}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export default AppCallbackUrlsList;
