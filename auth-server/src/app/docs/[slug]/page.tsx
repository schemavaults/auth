import "server-only";
import type { ServerRuntime } from "next";
import { apiDocs } from "../api-docs";

// GET /docs/<method>-<path-slug> — one page per operation (parameters,
// request body, responses, auth requirements, curl example).
export const generateStaticParams = apiDocs.generateStaticParams;
export const generateMetadata = apiDocs.generateOperationMetadata;

export default apiDocs.OperationPage;

export const runtime: ServerRuntime = "nodejs";
