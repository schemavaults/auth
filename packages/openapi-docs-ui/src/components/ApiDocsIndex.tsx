import type { ReactElement } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
  HttpMethodBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@schemavaults/ui";
import type { ApiDocsModel, ApiDocsOperation, ApiDocsTag } from "@/model/types";
import { operationDocsHref } from "@/model/slug";
import { ApiDocsHeader } from "./ApiDocsHeader";
import { ApiSecuritySchemesCard } from "./ApiSecuritySchemesCard";
import { OperationAuthBadges } from "./OperationAuthBadges";

export interface ApiDocsIndexProps {
  model: ApiDocsModel;
  /** Route under which operation pages live, e.g. `/docs`. */
  basePath: string;
  openApiDocumentHref?: string;
  /** Hide the security schemes card. */
  hideAuthentication?: boolean;
  /** Only these tags (default: all). */
  tags?: readonly string[];
  className?: string;
}

export interface OperationsTableProps {
  operations: readonly ApiDocsOperation[];
  basePath: string;
  className?: string;
}

/** Method / path / summary / access table linking to each operation page. */
export function OperationsTable({ operations, basePath, className }: OperationsTableProps): ReactElement {
  return (
    <div className={cn("overflow-x-auto rounded-md border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Method</TableHead>
            <TableHead>Path</TableHead>
            <TableHead className="hidden md:table-cell">Summary</TableHead>
            <TableHead>Access</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {operations.map((operation) => {
            const href = operationDocsHref(basePath, operation);
            return (
              <TableRow key={operation.slug} className={cn(operation.deprecated && "opacity-60")}>
                <TableCell>
                  <HttpMethodBadge method={operation.method} size="sm" width="fixed" />
                </TableCell>
                <TableCell>
                  <Link href={href} className="font-mono text-xs underline-offset-4 hover:underline">
                    {operation.path}
                  </Link>
                  <p className="text-xs text-muted-foreground md:hidden">{operation.summary}</p>
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">{operation.summary}</TableCell>
                <TableCell>
                  <OperationAuthBadges auth={operation.auth} deprecated={operation.deprecated} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export interface TagOperationsCardProps {
  tag: ApiDocsTag;
  basePath: string;
}

export function TagOperationsCard({ tag, basePath }: TagOperationsCardProps): ReactElement {
  return (
    <Card id={`tag-${tag.name.replace(/[^A-Za-z0-9_-]+/g, "-")}`} className="w-full">
      <CardHeader>
        <CardTitle>{tag.name}</CardTitle>
        <CardDescription>
          {tag.description ?? `${tag.operations.length} operation${tag.operations.length === 1 ? "" : "s"}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OperationsTable operations={tag.operations} basePath={basePath} />
      </CardContent>
    </Card>
  );
}

/**
 * Index page: document header, authentication schemes, and one card per
 * tag listing its operations with method, path, summary and access badges.
 */
export function ApiDocsIndex({
  model,
  basePath,
  openApiDocumentHref,
  hideAuthentication = false,
  tags,
  className,
}: ApiDocsIndexProps): ReactElement {
  const visibleTags = tags ? model.tags.filter((tag) => tags.includes(tag.name)) : model.tags;
  return (
    <div className={cn("flex w-full flex-col gap-6", className)}>
      <ApiDocsHeader model={model} openApiDocumentHref={openApiDocumentHref} />
      {visibleTags.length > 1 ? (
        <nav aria-label="API sections" className="flex flex-wrap gap-2 text-sm">
          {visibleTags.map((tag) => (
            <a
              key={tag.name}
              href={`#tag-${tag.name.replace(/[^A-Za-z0-9_-]+/g, "-")}`}
              className="rounded-md border px-2 py-1 underline-offset-4 hover:underline"
            >
              {tag.name} <span className="text-muted-foreground">({tag.operations.length})</span>
            </a>
          ))}
        </nav>
      ) : null}
      {!hideAuthentication ? <ApiSecuritySchemesCard schemes={model.securitySchemes} /> : null}
      {visibleTags.length === 0 ? (
        <EmptyState>
          <EmptyStateTitle>No operations</EmptyStateTitle>
          <EmptyStateDescription>The OpenAPI document does not declare any paths.</EmptyStateDescription>
        </EmptyState>
      ) : (
        visibleTags.map((tag) => <TagOperationsCard key={tag.name} tag={tag} basePath={basePath} />)
      )}
    </div>
  );
}

export default ApiDocsIndex;
