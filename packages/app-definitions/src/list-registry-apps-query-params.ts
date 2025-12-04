
import { z } from "zod";
import type { SchemaVaultsApp } from "./client-app-definition";

const list_apps_query_type = [
  'all', // admin-only
  'public', // publicly listed apps
  'authorized' // apps that the requesting user has authorized
] as const satisfies string[];

export type ListAppsQueryType = typeof list_apps_query_type[number];

export const listAppsQueryTypeSchema = z.string()
  .refine(
    (val: string): val is ListAppsQueryType => (list_apps_query_type as string[]).includes(val),
    `Invalid list apps query type. Should be one of: ${list_apps_query_type.map(val=>`"${val}"`).join(", ")}`
  )

export type ListAppsQueryResponse = {
  success: true;
  message: string;
  list: SchemaVaultsApp[];
} | {
  success: false;
  message: string;
}
