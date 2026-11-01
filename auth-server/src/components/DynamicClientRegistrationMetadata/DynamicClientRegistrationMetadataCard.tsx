"use client";

import { useMemo, type ReactElement } from "react";
import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@schemavaults/ui";
import { LocalDateTime } from "@schemavaults/auth-ui";
import { Bot, ExternalLink } from "lucide-react";
import { DetailRow } from "@/components/DetailRow";
import {
  summarizeDynamicClientRegistrationMetadata,
  type DynamicClientMetadataLink,
  type UnsafeUriReason,
} from "./registration-metadata";

export interface DynamicClientRegistrationMetadataCardProps {
  /** A client application registered through dynamic client registration. */
  app: SchemaVaultsApp;
}

const UNSAFE_URI_REASONS: Record<UnsafeUriReason, string> = {
  unparseable: "not a valid URL",
  scheme: "not an http(s) URL",
  credentials: "the URL embeds a username or password",
};

const TOKEN_ENDPOINT_AUTH_METHOD_HINTS: Record<string, string> = {
  none: "Public client: PKCE, no client secret",
  client_secret_basic: "Confidential client: client secret (HTTP Basic)",
  client_secret_post: "Confidential client: client secret (request body)",
};

function NotProvided(): ReactElement {
  return <span className="font-normal text-muted-foreground">Not provided</span>;
}

function OptionalText({ value }: { value: string | null }): ReactElement {
  return value === null ? <NotProvided /> : <>{value}</>;
}

function TokenList({ values }: { values: readonly string[] }): ReactElement {
  if (values.length === 0) {
    return <NotProvided />;
  }
  return (
    <span className="flex flex-row flex-wrap gap-1">
      {values.map((value) => (
        <Badge key={value} variant="outline" className="font-mono">
          {value}
        </Badge>
      ))}
    </span>
  );
}

/**
 * A client-supplied URI: a new-tab link (no referrer, no opener) when it
 * is a plain http(s) URL, plain text with the reason otherwise. Nothing is
 * fetched by this page, the logo included.
 */
function MetadataLink({ entry }: { entry: DynamicClientMetadataLink }): ReactElement {
  const { link } = entry;
  if (link === null) {
    return <NotProvided />;
  }
  if (!link.safe) {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="font-mono font-normal">{link.text}</span>
        <span className="text-xs text-destructive">
          Not linked: {UNSAFE_URI_REASONS[link.reason]}
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        referrerPolicy="no-referrer"
        className="inline-flex items-center gap-1 text-primary underline hover:no-underline"
        data-dynamic-client-metadata-link={entry.field}
      >
        <span className="break-all">{link.href}</span>
        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
      </a>
      {entry.field === "logo_uri" && (
        <span className="text-xs font-normal text-muted-foreground">
          Not loaded here; open the link to view it.
        </span>
      )}
    </span>
  );
}

/**
 * The RFC 7591 metadata a dynamically registered client supplied when it
 * registered itself, for the app detail page. Values are attacker-chosen,
 * so they are displayed defensively (see `registration-metadata.ts`).
 */
export function DynamicClientRegistrationMetadataCard({
  app,
}: DynamicClientRegistrationMetadataCardProps): ReactElement {
  const summary = useMemo(() => summarizeDynamicClientRegistrationMetadata(app), [app]);
  const authMethod: string | null = summary.token_endpoint_auth_method;

  return (
    <Card data-testid="dynamic-client-registration-metadata-card">
      <CardHeader>
        <CardTitle className="flex flex-row items-center gap-2">
          <Bot className="h-5 w-5" aria-hidden="true" />
          Dynamic Client Registration
        </CardTitle>
        <CardDescription>
          This client registered itself anonymously through OAuth 2.0 dynamic client registration
          (RFC 7591). Its name, description and the metadata below were supplied by the client and
          have not been verified.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <DetailRow
          label="Registered At"
          value={<LocalDateTime value={summary.client_id_issued_at_ms ?? app.created_at} />}
        />
        <DetailRow label="Software ID" value={<OptionalText value={summary.software_id} />} />
        <DetailRow label="Software Version" value={<OptionalText value={summary.software_version} />} />
        <DetailRow
          label="Token Endpoint Auth Method"
          value={
            authMethod === null ? (
              <NotProvided />
            ) : (
              <span className="flex flex-col gap-0.5">
                <span className="font-mono">{authMethod}</span>
                {TOKEN_ENDPOINT_AUTH_METHOD_HINTS[authMethod] && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {TOKEN_ENDPOINT_AUTH_METHOD_HINTS[authMethod]}
                  </span>
                )}
              </span>
            )
          }
        />
        <DetailRow label="Grant Types" value={<TokenList values={summary.grant_types} />} />
        <DetailRow label="Response Types" value={<TokenList values={summary.response_types} />} />
        <DetailRow
          label="Requested Scope"
          value={
            <span className="flex flex-col gap-1">
              <TokenList values={summary.requested_scopes} />
              {summary.requested_scopes.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  Declared by the client for reference only: it neither grants nor limits any
                  scope.
                </span>
              )}
            </span>
          }
        />
        <DetailRow
          label="Contacts"
          value={
            summary.contacts.length === 0 ? (
              <NotProvided />
            ) : (
              <span className="flex flex-col">
                {summary.contacts.map((contact) => (
                  <span key={contact}>{contact}</span>
                ))}
              </span>
            )
          }
        />
        {summary.links.map((entry) => (
          <DetailRow key={entry.field} label={entry.label} value={<MetadataLink entry={entry} />} />
        ))}
      </CardContent>
    </Card>
  );
}

export default DynamicClientRegistrationMetadataCard;
