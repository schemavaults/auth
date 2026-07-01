import "server-only";

import { type ApiServerId, type AppId, getAppEnvironment, getTokenAudienceForApiServerId } from "@schemavaults/app-definitions";
import { JWT_Factory } from "@schemavaults/jwt";
import { AuthServerJwtKeysManager } from "@/lib/AuthServerJwtKeysManager";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { type AccessToken, SCHEMAVAULTS_ORGANIZATION_ID } from "@schemavaults/auth-common";

export interface ISpoofSuperuserTokenOpts {
  client_app_id: AppId;
  audience_id: ApiServerId;
  db: Kysely<AuthDatabase>
}

const fakeSuperuserUid = "00000000-0000-0000-0000-000000000000" as const;

export default async function spoofSuperuserAccessToken(
  { client_app_id, audience_id, db }: ISpoofSuperuserTokenOpts
): Promise<AccessToken> {
  const jwt_keys = await new AuthServerJwtKeysManager(db).getFreshEnoughKeysetOrCreateNew(audience_id)

  const jwt_factory = new JWT_Factory({
    client_app_id,
    environment: getAppEnvironment(),
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
    user_organizations: [SCHEMAVAULTS_ORGANIZATION_ID]
  });

  const new_spoofed_access_token: AccessToken = await jwt_factory.access(
    getTokenAudienceForApiServerId(audience_id, getAppEnvironment()),
  );

  return new_spoofed_access_token;
}
