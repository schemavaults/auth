import { z } from "zod";
import { appIdSchema } from "./app-id";
import { apiServerIdSchema } from "./api-server-id";

export const appToApiPermissionSchema = z
  .object({
    client_app_id: appIdSchema,
    api_server_id: apiServerIdSchema,
    created_at: z.number().nonnegative(),
    created_by: z.string().uuid().optional().nullable(),
  })
  .required({
    client_app_id: true,
    api_server_id: true,
    created_at: true,
  })
  .strict();

export default appToApiPermissionSchema;

export type AppToApiPermission = z.infer<typeof appToApiPermissionSchema>;
