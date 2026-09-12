import type { ReactElement } from "react";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@schemavaults/ui";
import type { ApiDocsSecurityScheme } from "@/model/types";

export interface ApiSecuritySchemesCardProps {
  schemes: readonly ApiDocsSecurityScheme[];
  /** Only these scheme names (default: all). */
  filter?: readonly string[];
  title?: string;
  description?: string;
  className?: string;
}

export function securitySchemeAnchorId(schemeName: string): string {
  return `auth-scheme-${schemeName.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

/** One-line technical description of how a scheme's credential is transported. */
export function describeSecuritySchemeTransport(scheme: ApiDocsSecurityScheme): string {
  switch (scheme.type) {
    case "http":
      return scheme.scheme === "bearer"
        ? `Authorization: Bearer <${scheme.bearerFormat ?? "token"}>`
        : `Authorization: ${scheme.scheme ? scheme.scheme[0]?.toUpperCase() + scheme.scheme.slice(1) : "HTTP"} <credentials>`;
    case "apiKey":
      return `${scheme.in ?? "request"} "${scheme.parameterName ?? scheme.name}"`;
    case "oauth2":
      return `OAuth 2.0 (${scheme.flows.join(", ") || "flows unspecified"})`;
    case "openIdConnect":
      return `OpenID Connect discovery: ${scheme.openIdConnectUrl ?? ""}`;
    case "mutualTLS":
      return "Mutual TLS client certificate";
    default:
      return scheme.type;
  }
}

export function ApiSecuritySchemesCard({
  schemes,
  filter,
  title = "Authentication",
  description = "How to present credentials to this API. Each operation lists which of these it accepts.",
  className,
}: ApiSecuritySchemesCardProps): ReactElement | null {
  const visible = filter ? schemes.filter((scheme) => filter.includes(scheme.name)) : schemes;
  if (visible.length === 0) return null;
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {visible.map((scheme) => (
            <li key={scheme.name} id={securitySchemeAnchorId(scheme.name)} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{scheme.title}</span>
                <Badge variant="outline" className="font-mono font-normal">{scheme.name}</Badge>
                <Badge variant="secondary" className="font-normal">{scheme.type}</Badge>
              </div>
              <code className="w-fit rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {describeSecuritySchemeTransport(scheme)}
              </code>
              {scheme.description ? (
                <p className="text-sm text-muted-foreground">{scheme.description}</p>
              ) : null}
              {scheme.challenge ? (
                <p className="text-xs text-muted-foreground">
                  Missing credentials answer with <code className="font-mono">WWW-Authenticate: {scheme.challenge}</code>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default ApiSecuritySchemesCard;
