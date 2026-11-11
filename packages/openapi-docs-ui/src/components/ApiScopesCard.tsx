"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  HttpMethodBadge,
  cn,
} from "@schemavaults/ui";
import type { ApiDocsOperation, ApiDocsScope } from "@/model/types";
import { operationDocsHref } from "@/model/slug";
import { DocsText } from "./DocsText";
import { DOCS_CARD_CONTENT_CLASS, DOCS_CARD_HEADER_CLASS } from "./card-padding";

export interface ApiScopesCardProps {
  scopes: readonly ApiDocsScope[];
  /** The document's operations, to link the ones requiring each scope. */
  operations: readonly ApiDocsOperation[];
  /** Route under which operation pages live, e.g. `/docs`. */
  basePath: string;
  title?: string;
  description?: string;
  className?: string;
}

/** Anchor id of a scope's entry in {@link ApiScopesCard}. */
export function scopeAnchorId(scope: string): string {
  return `scope-${scope.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

/** Every scope of the API, what it allows, and the operations that require it. */
export function ApiScopesCard({
  scopes,
  operations,
  basePath,
  title = "Scopes",
  description = "What each OAuth 2.0 scope allows. An operation that requires scopes refuses tokens whose scope claim lacks any of them.",
  className,
}: ApiScopesCardProps): ReactElement | null {
  if (scopes.length === 0) return null;
  const bySlug = new Map(operations.map((operation) => [operation.slug, operation]));
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className={DOCS_CARD_HEADER_CLASS}>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={DOCS_CARD_CONTENT_CLASS}>
        <ul className="flex flex-col divide-y">
          {scopes.map((scope) => {
            const requiredBy = scope.requiredBy
              .map((slug) => bySlug.get(slug))
              .filter((operation): operation is ApiDocsOperation => operation !== undefined);
            return (
              <li
                key={scope.scope}
                id={scopeAnchorId(scope.scope)}
                data-testid="api-docs-scope"
                data-scope={scope.scope}
                className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0"
              >
                <Badge variant="outline" className="w-fit font-mono font-normal [overflow-wrap:anywhere]">
                  {scope.scope}
                </Badge>
                {scope.description ? (
                  <p className="text-sm"><DocsText text={scope.description} /></p>
                ) : (
                  <p className="text-sm text-muted-foreground">No description.</p>
                )}
                {requiredBy.length > 0 ? (
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span>Required by</span>
                    <ul className="flex flex-col gap-1">
                      {requiredBy.map((operation) => (
                        <li key={operation.slug} className="flex flex-wrap items-center gap-2">
                          <HttpMethodBadge method={operation.method} size="sm" width="fixed" />
                          <Link
                            href={operationDocsHref(basePath, operation)}
                            className="font-mono underline-offset-4 [overflow-wrap:anywhere] hover:underline"
                          >
                            {operation.path}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No operation requires it.</p>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export default ApiScopesCard;
