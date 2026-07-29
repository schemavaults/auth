import "server-only";
import { NextResponse } from "next/server";
import {
  getAppEnvironment,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type ServerlessDatabase from "@/lib/auth-db/serverless-database";
import {
  listTopMostActiveUsersSince,
  listUsersCreatedSince,
} from "@/lib/auth-db/users";
import { listErrorsCreatedSince } from "@/lib/auth-db/errors";
import { listOrganizationsCreatedSince } from "@/lib/auth-db/organizations";
import { listTopMostPopularAppsSince } from "@/lib/auth-db/apps";
import { listTopMostPopularApisSince } from "@/lib/auth-db/apis";
import sendEmailViaMailServer from "@/lib/mail/send-email-via-mail-server";
import captureServerException from "@/lib/captureServerException";
import { buildDailyAdminReport } from "./buildReportHtml";
import type { RedisCache } from "@/lib/redis";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ADMIN_MAILING_LIST_ID = "00000000-0000-0000-0000-000000000000";
const OP_NAME = "send-daily-admin-report";
const ROUTE = "/api/admin/send-daily-report";

interface SendDailyReportDeps {
  dbh: ServerlessDatabase;
  redis: RedisCache;
  uid?: string;
}

export async function sendDailyReportHandler({
  dbh,
  redis,
  uid,
}: SendDailyReportDeps): Promise<NextResponse> {
  try {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - TWENTY_FOUR_HOURS_MS);

    const [
      newUsers,
      newOrganizations,
      newErrors,
      topMostActiveUsers,
      topMostPopularApps,
      topMostPopularApis,
    ] = await Promise.all([
      listUsersCreatedSince(dbh.db, windowStart.getTime()),
      listOrganizationsCreatedSince(dbh.db, windowStart.getTime()),
      listErrorsCreatedSince(dbh.db, windowStart.getTime()),
      listTopMostActiveUsersSince(dbh.db, windowStart.getTime(), 10),
      listTopMostPopularAppsSince(dbh.db, windowStart.getTime(), 10),
      listTopMostPopularApisSince(dbh.db, windowStart.getTime(), 10),
    ]);

    const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
    const authServerUri: string = getAuthServerUrl(appEnv);
    const friendlyName: string = getAuthServerFriendlyName();
    // Refresh tokens are always recorded against the auth server's own
    // audience, so the report needs the id to know which row's refresh count is
    // meaningful (all other rows render "N/A").
    const authServerApiServerId: string = getAuthServerAppId();

    const { text, html } = buildDailyAdminReport({
      authServerUri,
      friendlyName,
      windowStart,
      windowEnd,
      newUsers,
      newOrganizations,
      newErrors,
      topMostActiveUsers,
      topMostPopularApps,
      topMostPopularApis,
      authServerApiServerId,
    });

    const dateLabel = windowEnd.toISOString().slice(0, 10);

    await sendEmailViaMailServer(
      {
        to: ADMIN_MAILING_LIST_ID,
        subject: `${friendlyName} Daily Admin Report — ${dateLabel}`,
        message: { text, html },
      },
      dbh.db,
      redis,
    );

    return NextResponse.json({
      ok: true,
      users_count: newUsers.length,
      organizations_count: newOrganizations.length,
      errors_count: newErrors.length,
      top_most_active_users_count: topMostActiveUsers.length,
      top_most_popular_apps_count: topMostPopularApps.length,
      top_most_popular_apis_count: topMostPopularApis.length,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
    });
  } catch (err: unknown) {
    console.error("[sendDailyReportHandler] failed:", err);
    await captureServerException(dbh.db, err, {
      op_name: OP_NAME,
      route: ROUTE,
      uid,
    });
    return NextResponse.json(
      {
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : "Failed to generate or send the daily admin report.",
      },
      { status: 500 },
    );
  }
}

export default sendDailyReportHandler;
