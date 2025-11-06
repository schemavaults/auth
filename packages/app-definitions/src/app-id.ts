
import { z } from "zod";
import {HARDCODED_CORE_SCHEMAVAULTS_APPS, type HardcodedAppId} from "./hardcoded-core-schemavaults-apps";

const hardcoded_app_ids = HARDCODED_CORE_SCHEMAVAULTS_APPS.map(
  hardcoded_app => hardcoded_app.app_id
) satisfies readonly string[];


const hardcodedAppIdSchema = z.string().refine((app_id: string): app_id is HardcodedAppId => {
  hardcoded_app_ids satisfies readonly string[];
  return (hardcoded_app_ids as readonly string[]).includes(app_id);
}, "Invalid hardcoded app id");

export const appIdSchema = z.union([
  z.string().uuid(),
  hardcodedAppIdSchema
] as const);

export type AppId = z.infer<typeof appIdSchema>;
