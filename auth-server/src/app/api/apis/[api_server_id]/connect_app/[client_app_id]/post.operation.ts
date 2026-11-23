import {
  appToApiPermissionSchema,
  isHardcodedApiServerId,
  type AppToApiPermission,
} from "@schemavaults/app-definitions";
import { updateAppApiConnectionFirstPartyRequestSchema } from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import { requireAuth, withOpenApi, z } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  ErrorResponse,
  ResourceCreationResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppToApiPermissionsRegistry } from "@/lib/auth-db";
import { setFirstPartyAppApiConnection } from "@/lib/auth-db/apis";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { appToHardcodedApiPermissionSchema } from "@/lib/auth-db/apis/apps-to-hardcoded-apis-permissions-table";
import captureServerException from "@/lib/captureServerException";
import { ConflictError } from "@/lib/error/ConflictError";
import { CONNECTION_AUTH_NOTES, ROUTE, connectionParams, loadConnectionResources } from "./connection-access";

/**
 * Optional body: `{ first_party: true }` also marks the new connection
 * first-party (the same flag as
 * `PUT /api/apis/{api_server_id}/connect_app/{client_app_id}/first-party`),
 * in the transaction that creates it.
 */
const ConnectAppToApiServerRequest = withOpenApi(
  updateAppApiConnectionFirstPartyRequestSchema.partial(),
  "ConnectAppToApiServerRequest",
  {
    description:
      "Optional; defaults to `{ \"first_party\": false }`. `first_party: true` also marks the new connection first-party (users signing in to the app for the API server consent implicitly, see `PUT /api/apis/{api_server_id}/connect_app/{client_app_id}/first-party`): platform administrators only, and not for hardcoded API servers (they define no API scopes). Unknown keys are rejected.",
  },
);

const ConnectAppToApiServerResponse = ResourceCreationResponse.extend({
  first_party: z.boolean().openapi({
    description: "Whether the new connection is first-party (users consent implicitly)",
  }),
}).openapi("ConnectAppToApiServerResponse");

type Db = Kysely<AuthDatabase> | Transaction<AuthDatabase>;

export const connectAppToApiServer = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Connect an app to an API server",
  description:
    "Allows the client application to be issued access tokens for the API server. Responds 409 when the app is already connected (the client SDK maps it to `AppAlreadyConnectedToApiServerError`); nothing changes then, so an existing connection is marked first-party with `PUT /api/apis/{api_server_id}/connect_app/{client_app_id}/first-party` instead. The request body is optional: a platform administrator may send `{ \"first_party\": true }` to mark the new connection first-party in the same transaction.",
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: `${CONNECTION_AUTH_NOTES} \`first_party: true\`: platform administrators only.`,
  }),
  request: {
    params: connectionParams,
    body: {
      required: false,
      lenientContentType: true,
      schema: ConnectAppToApiServerRequest,
      description: "Optional; defaults to `{ \"first_party\": false }`.",
    },
  },
  responses: {
    200: {
      description: "The app was connected; `resource_id` is the API server id",
      schema: ConnectAppToApiServerResponse,
    },
    // 400: malformed body or ids, or `first_party: true` for a hardcoded API server
    ...validationErrorResponse,
    ...sessionErrorResponses,
    // 403: the caller may not connect them, or asked for `first_party: true` without being a platform administrator
    404: { description: "No such app or API server", schema: ErrorResponse },
    409: { description: "The app is already connected to the API server", schema: ErrorResponse },
    500: { description: "Failed to connect the app", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, environment } = ctx.context;
    const { api_server_id, client_app_id } = ctx.params;
    if (environment === "development") {
      console.log(`[/api/apis/${api_server_id}/connect_app/${client_app_id}] POST request received`);
    }

    const access = await loadConnectionResources(db, user, api_server_id, client_app_id, {
      app: "You must own the app (organization owner or owning user) to connect it!",
      both: "You must own both the app and the API server (organization owner or owning user) to connect them!",
    });
    if (!access.ok) {
      return ctx.json(access.status, { success: false, message: access.message });
    }

    // Waiving every user's consent screen is a platform administrator's
    // call (as on the first-party endpoint), not the connection's managers'.
    const first_party: boolean = ctx.body?.first_party === true;
    if (first_party) {
      if (user.admin !== true) {
        return ctx.json(403, {
          success: false,
          message: "Only platform administrators may mark a connection first-party",
        });
      }
      if (isHardcodedApiServerId(api_server_id)) {
        return ctx.json(400, {
          success: false,
          message: "Hardcoded API servers define no API scopes, so their connections cannot be first-party",
        });
      }
    }

    // PERMISSION HAS BEEN VALIDATED IF THIS POINT REACHED
    if (environment === "development") {
      console.log(
        `[/api/apis/${api_server_id}/connect_app/${client_app_id}] User has permission to connect app to api!`,
      );
    }

    let newPermission: AppToApiPermission;
    try {
      const schema = isHardcodedApiServerId(api_server_id)
        ? appToHardcodedApiPermissionSchema
        : appToApiPermissionSchema;
      const parsed = await schema.safeParseAsync({ api_server_id, client_app_id, created_at: Date.now() });
      if (!parsed.success) throw parsed.error;
      newPermission = parsed.data;
    } catch (e: unknown) {
      console.error(e);
      return ctx.json(400, {
        success: false,
        message: "Failed to parse which app to connect to which API server",
      });
    }

    const connect = async (trx: Db): Promise<void> => {
      await new SchemaVaultsAppToApiPermissionsRegistry(trx).allow(
        newPermission.client_app_id,
        newPermission.api_server_id,
      );
      if (first_party) {
        await setFirstPartyAppApiConnection(trx, {
          client_app_id,
          api_server_id,
          first_party: true,
          updated_by: user.uid,
        });
      }
    };
    try {
      // Both or neither: a connection that should have been first-party
      // must not be left behind asking users for consent.
      if (first_party) {
        await db.transaction().execute(connect);
      } else {
        await connect(db);
      }
    } catch (e: unknown) {
      if (e instanceof ConflictError) {
        return ctx.json(409, { success: false, message: e.message });
      }
      await captureServerException(db, e, {
        op_name: "POST_connect_app_to_api.allow",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id, client_app_id, first_party },
      });
      return ctx.json(500, { success: false, message: "Failed to connect app to API server" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully conected frontend application to API server",
      resource_id: newPermission.api_server_id,
      first_party,
    });
  },
});
