import "server-only";
import type { ServerRuntime } from "next";
import { apiDocs } from "./api-docs";

// GET /docs — index of every API operation, grouped by tag.
export const generateMetadata = apiDocs.generateIndexMetadata;

export default apiDocs.IndexPage;

export const runtime: ServerRuntime = "nodejs";
