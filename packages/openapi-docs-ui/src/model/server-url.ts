import type { ApiDocsModel } from "./types";

/**
 * Returns a copy of the model whose `servers` list starts with `url`,
 * keeping the first documented server's description. Used to substitute
 * the public origin resolved at request time for a document generated
 * with a relative or placeholder server URL.
 */
export function withServerUrl(model: ApiDocsModel, url: string): ApiDocsModel {
  const description = model.servers[0]?.description;
  return {
    ...model,
    servers: [{ url, ...(description !== undefined ? { description } : {}) }],
  };
}
