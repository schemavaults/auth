import { z } from "zod";
import { appIdSchema } from "./app-id";
import { apiServerIdSchema } from './api-server-id';

export const appToApiPermissionSchema = z.object({
  client_app_id: appIdSchema,
  api_server_id: apiServerIdSchema,
  created_at: z.number().nonnegative()
}).required().strict();

export type AppToApiPermission = z.infer<typeof appToApiPermissionSchema>;
