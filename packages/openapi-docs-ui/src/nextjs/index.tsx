import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { parseOpenApiDocument } from "@/model/parse-openapi-document";
import { findOperationBySlug } from "@/model/slug";
import type { ApiDocsModel } from "@/model/types";
import { ApiDocsIndex, type ApiDocsIndexProps } from "@/components/ApiDocsIndex";
import { ApiOperationPage, type ApiOperationPageProps } from "@/components/ApiOperationPage";

export interface CreateApiDocsPagesOptions {
  /**
   * Loads the OpenAPI document (object) or an already parsed model. Called
   * on every render / static generation pass, so cache inside if it is
   * expensive (e.g. wrap with React `cache()`).
   */
  readonly loadDocument: () => Promise<unknown> | unknown;
  /** Route of the docs index, e.g. `/docs`. */
  readonly basePath: string;
  /** Dynamic segment name of the operation page (default `slug`). */
  readonly slugParam?: string;
  /** URL of the raw OpenAPI JSON, shown in the header. */
  readonly openApiDocumentHref?: string;
  /** Extra props forwarded to the index component. */
  readonly indexProps?: Omit<ApiDocsIndexProps, "model" | "basePath" | "openApiDocumentHref">;
  /** Extra props forwarded to the operation page component. */
  readonly operationProps?: Omit<ApiOperationPageProps, "model" | "operation" | "basePath">;
  /** Wraps each page (layout chrome, containers). */
  readonly wrap?: (page: ReactElement) => ReactElement;
}

export interface ApiDocsOperationPageProps {
  readonly params: Promise<Record<string, string | string[] | undefined>>;
}

export interface ApiDocsPageMetadata {
  readonly title: string;
  readonly description?: string;
}

export interface ApiDocsPages {
  /** `app/docs/page.tsx` default export. */
  readonly IndexPage: () => Promise<ReactElement>;
  /** `app/docs/[slug]/page.tsx` default export. */
  readonly OperationPage: (props: ApiDocsOperationPageProps) => Promise<ReactElement>;
  /** `generateStaticParams` for the operation page. */
  readonly generateStaticParams: () => Promise<Record<string, string>[]>;
  /** `generateMetadata` for the operation page. */
  readonly generateOperationMetadata: (props: ApiDocsOperationPageProps) => Promise<ApiDocsPageMetadata>;
  /** `generateMetadata` for the index page. */
  readonly generateIndexMetadata: () => Promise<ApiDocsPageMetadata>;
  /** Loads and parses the model (memoise upstream if needed). */
  readonly loadModel: () => Promise<ApiDocsModel>;
}

function isModel(value: unknown): value is ApiDocsModel {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as ApiDocsModel).operations) &&
    Array.isArray((value as ApiDocsModel).tags) &&
    typeof (value as ApiDocsModel).title === "string"
  );
}

/**
 * Builds the Next.js App Router pages for a `docs/` directory:
 *
 * ```
 * app/docs/page.tsx          → export default IndexPage
 * app/docs/[slug]/page.tsx   → export default OperationPage; export { generateStaticParams }
 * ```
 *
 * ```ts
 * // app/docs/api-docs.ts
 * export const apiDocs = createApiDocsPages({
 *   loadDocument: () => openApiDocument,
 *   basePath: "/docs",
 *   openApiDocumentHref: "/api/openapi.json",
 * });
 * ```
 */
export function createApiDocsPages(options: CreateApiDocsPagesOptions): ApiDocsPages {
  const slugParam = options.slugParam ?? "slug";
  const wrap = options.wrap ?? ((page: ReactElement): ReactElement => page);

  const loadModel = async (): Promise<ApiDocsModel> => {
    const loaded = await options.loadDocument();
    return isModel(loaded) ? loaded : parseOpenApiDocument(loaded);
  };

  const resolveSlug = async (props: ApiDocsOperationPageProps): Promise<string | null> => {
    const params = await props.params;
    const raw = params[slugParam];
    return typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? null) : null;
  };

  return {
    loadModel,
    async IndexPage(): Promise<ReactElement> {
      const model = await loadModel();
      return wrap(
        <ApiDocsIndex
          {...options.indexProps}
          model={model}
          basePath={options.basePath}
          openApiDocumentHref={options.openApiDocumentHref}
        />,
      );
    },
    async OperationPage(props: ApiDocsOperationPageProps): Promise<ReactElement> {
      const model = await loadModel();
      const slug = await resolveSlug(props);
      const operation = slug ? findOperationBySlug(model, slug) : null;
      if (!operation) notFound();
      return wrap(
        <ApiOperationPage
          {...options.operationProps}
          model={model}
          operation={operation}
          basePath={options.basePath}
        />,
      );
    },
    async generateStaticParams(): Promise<Record<string, string>[]> {
      const model = await loadModel();
      return model.operations.map((operation) => ({ [slugParam]: operation.slug }));
    },
    async generateOperationMetadata(props: ApiDocsOperationPageProps): Promise<ApiDocsPageMetadata> {
      const model = await loadModel();
      const slug = await resolveSlug(props);
      const operation = slug ? findOperationBySlug(model, slug) : null;
      if (!operation) return { title: `Not found | ${model.title}` };
      return {
        title: `${operation.method} ${operation.path} | ${model.title}`,
        ...(operation.description !== undefined
          ? { description: operation.description }
          : { description: operation.summary }),
      };
    },
    async generateIndexMetadata(): Promise<ApiDocsPageMetadata> {
      const model = await loadModel();
      return {
        title: `${model.title} API reference`,
        ...(model.description !== undefined ? { description: model.description } : {}),
      };
    },
  };
}

export { parseOpenApiDocument, findOperationBySlug };
