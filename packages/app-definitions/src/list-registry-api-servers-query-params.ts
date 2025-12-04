
import { z } from "zod";
import type { SchemaVaultsApiServerDefinition } from "./api-server-definition";

const list_api_servers_query_type = [
  'all', // admin-only
] as const satisfies string[];

export type ListApiServersQueryType = typeof list_api_servers_query_type[number];

export const listApiServersQueryTypeSchema = z.string()
  .refine(
    (val: string): val is ListApiServersQueryType => (list_api_servers_query_type as string[]).includes(val),
    `Invalid list API servers query type. Should be one of: ${list_api_servers_query_type.map(val=>`"${val}"`).join(", ")}`
  )

export type ListApiServersQueryResponse = {
  success: true;
  message: string;
  list: SchemaVaultsApiServerDefinition[];
} | {
  success: false;
  message: string;
}
