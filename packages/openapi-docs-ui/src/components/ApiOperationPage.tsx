import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import {
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  HttpMethodBadge,
  cn,
} from "@schemavaults/ui";
import type { ApiDocsModel, ApiDocsOperation, ApiDocsParameterLocation } from "@/model/types";
import { operationDocsHref } from "@/model/slug";
import { OperationAuthCard } from "./OperationAuthCard";
import { OperationAuthBadges } from "./OperationAuthBadges";
import { PARAMETER_LOCATION_LABELS, ParametersTable } from "./ParametersTable";
import { RequestBodySection } from "./RequestBodySection";
import { ResponsesList } from "./ResponsesList";
import { CurlSnippet } from "./CurlSnippet";

export interface ApiOperationPageProps {
  model: ApiDocsModel;
  operation: ApiDocsOperation;
  /** Route of the docs index, e.g. `/docs`. */
  basePath: string;
  /** Label of the index breadcrumb (default: the document title). */
  indexLabel?: string;
  /** Hide the curl example. */
  hideCurl?: boolean;
  /** Base URL used in the curl example (default: first documented server). */
  curlBaseUrl?: string;
  /** Show generated example values next to schemas (default true). */
  showExamples?: boolean;
  className?: string;
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

const PARAMETER_LOCATIONS: readonly ApiDocsParameterLocation[] = ["path", "query", "header", "cookie"];

/** Full detail page for one operation. */
export function ApiOperationPage({
  model,
  operation,
  basePath,
  indexLabel,
  hideCurl = false,
  curlBaseUrl,
  showExamples = true,
  className,
}: ApiOperationPageProps): ReactElement {
  const indexHref = basePath.replace(/\/+$/, "") || "/";
  const related = model.operations.filter(
    (candidate) => candidate.path === operation.path && candidate.slug !== operation.slug,
  );
  return (
    <article className={cn("flex w-full flex-col gap-6", className)}>
      <Breadcrumb size="sm">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={indexHref}>{indexLabel ?? model.title}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {operation.tags[0] ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={`${indexHref}#tag-${operation.tags[0].replace(/[^A-Za-z0-9_-]+/g, "-")}`}>
                    {operation.tags[0]}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          ) : null}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">{operation.path}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <HttpMethodBadge method={operation.method} size="lg" />
          <code className="text-lg font-semibold">{operation.path}</code>
          <OperationAuthBadges auth={operation.auth} deprecated={operation.deprecated} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{operation.summary}</h1>
        {operation.description ? (
          <p className="max-w-prose whitespace-pre-line text-sm text-muted-foreground">{operation.description}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {operation.operationId ? (
            <span>
              operationId <code className="font-mono">{operation.operationId}</code>
            </span>
          ) : null}
          {operation.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="font-normal">{tag}</Badge>
          ))}
          {operation.externalDocsUrl ? (
            <a href={operation.externalDocsUrl} className="underline-offset-4 hover:underline" rel="noreferrer">
              External documentation
            </a>
          ) : null}
        </div>
      </header>

      <OperationAuthCard auth={operation.auth} schemes={model.securitySchemes} schemesHref={indexHref} />

      {PARAMETER_LOCATIONS.map((location) => {
        const table = <ParametersTable parameters={operation.parameters} schemas={model.schemas} location={location} />;
        return operation.parameters.some((parameter) => parameter.in === location) ? (
          <Section key={location} title={PARAMETER_LOCATION_LABELS[location]}>
            {table}
          </Section>
        ) : null;
      })}

      {operation.requestBody ? (
        <Section title="Request body">
          <RequestBodySection requestBody={operation.requestBody} schemas={model.schemas} showExample={showExamples} />
        </Section>
      ) : null}

      <Section title="Responses">
        <ResponsesList responses={operation.responses} schemas={model.schemas} showExample={showExamples} />
      </Section>

      {!hideCurl ? (
        <Section title="Example request">
          <CurlSnippet operation={operation} model={model} baseUrl={curlBaseUrl} />
        </Section>
      ) : null}

      {related.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Other methods on this path</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {related.map((candidate) => (
                <li key={candidate.slug}>
                  <Link href={operationDocsHref(basePath, candidate)} className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm underline-offset-4 hover:underline">
                    <HttpMethodBadge method={candidate.method} size="sm" />
                    {candidate.summary}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </article>
  );
}

export default ApiOperationPage;
