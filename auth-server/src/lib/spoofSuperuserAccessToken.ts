import "server-only";

import { type ApiServerId, type AppId, getAppEnvironment, getTokenAudienceForApiServerId, SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { type I_JWT_Keys, JWT_Factory } from "@schemavaults/jwt";
import { AuthServerJwtKeysManager } from "@/lib/AuthServerJwtKeysManager";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { type AccessToken } from "@schemavaults/auth-common";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";

export interface ISpoofSuperuserTokenOpts {
  client_app_id: AppId;
  audience_id: ApiServerId;
  db: Kysely<AuthDatabase>;
  environment?: SchemaVaultsAppEnvironment;
}

const fakeSuperuserUid = "00000000-0000-0000-0000-000000000000" as const;

export default async function spoofSuperuserAccessToken(
  {
    client_app_id,
    audience_id,
    db,
    environment = getAppEnvironment()
 }: ISpoofSuperuserTokenOpts
): Promise<AccessToken> {
  const keys_manager = new AuthServerJwtKeysManager(db);
  const jwt_keys: I_JWT_Keys = await keys_manager.getFreshEnoughKeysetOrCreateNew(
    audience_id
  );

  const jwt_factory = new JWT_Factory({
    client_app_id,
    environment,
    jwt_keys,
    user: {
      email: "admin@schemavaults.com",
      email_verified: false,
      sub: fakeSuperuserUid,
      uid: fakeSuperuserUid,
      admin: true,
      created_at: Date.now(),
      disabled: false,
    },
    user_organizations: [getAuthServerOwnerOrganizationId()]
  });

  const new_spoofed_access_token: AccessToken = await jwt_factory.access(
    getTokenAudienceForApiServerId(audience_id, environment),
  );

  return new_spoofed_access_token;
}
