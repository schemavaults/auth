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
import captureServerException from "@/lib/captureServerException";
import { buildDailyAdminReport } from "./buildReportHtml";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ADMIN_MAILING_LIST_ID = "00000000-0000-0000-0000-000000000000";
const OP_NAME = "send-daily-admin-report";
const ROUTE = "/api/admin/send-daily-report";

interface SendDailyReportDeps {
  dbh: ServerlessDatabase;
  uid?: string;
}

export async function sendDailyReportHandler({
  dbh,
  uid,
}: SendDailyReportDeps): Promise<NextResponse> {
  try {
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
