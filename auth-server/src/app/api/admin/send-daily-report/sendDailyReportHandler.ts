import "server-only";
import { NextResponse } from "next/server";
import {
  getAppEnvironment,
  getAuthServerUri,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type ServerlessDatabase from "@/lib/auth-db/serverless-database";
import { listUsersCreatedSince } from "@/lib/auth-db/users";
import { listErrorsCreatedSince } from "@/lib/auth-db/errors";
import sendEmailViaMailServer from "@/lib/send-email-via-mail-server";
import { buildDailyAdminReport } from "./buildReportHtml";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ADMIN_MAILING_LIST_ID = "00000000-0000-0000-0000-000000000000";

interface SendDailyReportDeps {
  dbh: ServerlessDatabase;
}

export async function sendDailyReportHandler({
  dbh,
}: SendDailyReportDeps): Promise<NextResponse> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - TWENTY_FOUR_HOURS_MS);

  const [newUsers, newErrors] = await Promise.all([
    listUsersCreatedSince(dbh.db, windowStart.getTime()),
    listErrorsCreatedSince(dbh.db, windowStart.getTime()),
  ]);

  const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
  const authServerUri: string = getAuthServerUri(appEnv);

  const { text, html } = buildDailyAdminReport({
    authServerUri,
    windowStart,
    windowEnd,
    newUsers,
    newErrors,
  });

  const dateLabel = windowEnd.toISOString().slice(0, 10);

  await sendEmailViaMailServer(
    {
      to: ADMIN_MAILING_LIST_ID,
      subject: `SchemaVaults Daily Admin Report — ${dateLabel}`,
      message: { text, html },
    },
    dbh.db,
  );

  return NextResponse.json({
    ok: true,
    users_count: newUsers.length,
    errors_count: newErrors.length,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
  });
}

export default sendDailyReportHandler;
