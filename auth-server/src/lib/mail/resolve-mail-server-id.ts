import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { RedisCache } from "@/lib/redis";
import mailServerConfigured from "@/lib/config/mail-server-configured";
import mailServerApiId from "@/lib/config/mail-server-api-id";
import { type ApiServerId, apiServerIdSchema } from "@schemavaults/app-definitions";
import MailServerNotConfiguredError from "@/lib/error/MailServerNotConfiguredError";


export default async function resolveMailServerId(db: Kysely<AuthDatabase>, redis: RedisCache): Promise<ApiServerId> {
  const configured: boolean = await mailServerConfigured(db, redis.client);
  if (typeof configured !== 'boolean') {
    throw new TypeError("Expected 'configured' to be a boolean from mail-server-configured check result!")
  }
  if (!configured) {
    throw new MailServerNotConfiguredError("Mail server does not appear to be configured!");
  }
  const parsed_mail_api_server_id = await apiServerIdSchema.safeParseAsync(
    await mailServerApiId(db, redis.client)
  );
  if (!parsed_mail_api_server_id.success) {
    throw new MailServerNotConfiguredError(
      "Mail server does not appear to be configured with a valid API server ID!",
      { cause: parsed_mail_api_server_id.error }
    );
  }
  const mail_api_server_id: string = parsed_mail_api_server_id.data;
  return mail_api_server_id;
}
