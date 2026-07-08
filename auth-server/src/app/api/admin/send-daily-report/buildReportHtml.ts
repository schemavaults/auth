import "server-only";
import { brandColors } from "@schemavaults/theme";
import type { OrganizationDefinition } from "@schemavaults/auth-common";
import type { TopMostActiveUserRow, UserDocument } from "@/lib/auth-db/users";
import type { ErrorRow } from "@/lib/auth-db/errors";
import type { TopMostPopularAppRow } from "@/lib/auth-db/apps";
import type { TopMostPopularApiRow } from "@/lib/auth-db/apis";

interface BuildReportOpts {
  authServerUri: string;
  /** White-label deployment name rendered in the report heading. */
  friendlyName: string;
  windowStart: Date;
  windowEnd: Date;
  newUsers: readonly UserDocument[];
  newOrganizations: readonly OrganizationDefinition[];
  newErrors: readonly ErrorRow[];
  topMostActiveUsers: readonly TopMostActiveUserRow[];
  topMostPopularApps: readonly TopMostPopularAppRow[];
  topMostPopularApis: readonly TopMostPopularApiRow[];
}

interface ReportContent {
  text: string;
  html: string;
}

const BRAND_BLUE = brandColors["schemavaults-brand-blue"];
const BRAND_RED = brandColors["schemavaults-brand-red"];
const TEXT_COLOR = "#111827";
const MUTED_COLOR = "#6b7280";
const BORDER_COLOR = "#e5e7eb";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function buildDailyAdminReport({
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
}: BuildReportOpts): ReportContent {
  const windowLabel = `${formatTimestamp(windowStart.getTime())} → ${formatTimestamp(windowEnd.getTime())}`;

  const usersRows = newUsers.length === 0
    ? `<tr><td colspan="3" style="padding:12px;color:${MUTED_COLOR};font-style:italic;">No new sign-ups in the last 24 hours.</td></tr>`
    : newUsers
        .map((u) => {
          const link = `${authServerUri}/admin/users/${encodeURIComponent(u.uid)}`;
          return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};font-family:monospace;font-size:12px;color:${MUTED_COLOR};">${escapeHtml(u.uid)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};"><a href="${link}" style="color:${BRAND_BLUE};text-decoration:none;">${escapeHtml(u.email)}</a></td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${MUTED_COLOR};font-size:13px;">${formatTimestamp(u.created_at)}</td>
</tr>`;
        })
        .join("\n");

  const organizationsRows = newOrganizations.length === 0
    ? `<tr><td colspan="3" style="padding:12px;color:${MUTED_COLOR};font-style:italic;">No new organizations in the last 24 hours.</td></tr>`
    : newOrganizations
        .map((o) => {
          const link = `${authServerUri}/org/${encodeURIComponent(o.organization_id)}`;
          return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};font-family:monospace;font-size:12px;color:${MUTED_COLOR};">${escapeHtml(o.organization_id)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};"><a href="${link}" style="color:${BRAND_BLUE};text-decoration:none;">${escapeHtml(o.name)}</a></td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${MUTED_COLOR};font-size:13px;">${formatTimestamp(o.created_at)}</td>
</tr>`;
        })
        .join("\n");

  const topMostActiveRows = topMostActiveUsers.length === 0
    ? `<tr><td colspan="6" style="padding:12px;color:${MUTED_COLOR};font-style:italic;">No user activity in the last 24 hours.</td></tr>`
    : topMostActiveUsers
        .map((u, i) => {
          const link = `${authServerUri}/admin/users/${encodeURIComponent(u.uid)}`;
          return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;width:48px;">#${i + 1}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};font-family:monospace;font-size:12px;color:${MUTED_COLOR};">${escapeHtml(u.uid)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};"><a href="${link}" style="color:${BRAND_BLUE};text-decoration:none;">${escapeHtml(u.email)}</a></td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;text-align:right;">${u.sign_in_count.toLocaleString("en-US")}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;text-align:right;">${u.access_token_count.toLocaleString("en-US")}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;text-align:right;">${u.refresh_token_count.toLocaleString("en-US")}</td>
</tr>`;
        })
        .join("\n");

  const topPopularAppsRows = topMostPopularApps.length === 0
    ? `<tr><td colspan="5" style="padding:12px;color:${MUTED_COLOR};font-style:italic;">No application token activity in the last 24 hours.</td></tr>`
    : topMostPopularApps
        .map((a, i) => {
          return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;width:48px;">#${i + 1}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};">${escapeHtml(a.app_name)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};font-family:monospace;font-size:12px;color:${MUTED_COLOR};">${escapeHtml(a.client_app_id)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;text-align:right;">${a.access_token_count.toLocaleString("en-US")}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;text-align:right;">${a.refresh_token_count.toLocaleString("en-US")}</td>
</tr>`;
        })
        .join("\n");

  const topPopularApisRows = topMostPopularApis.length === 0
    ? `<tr><td colspan="5" style="padding:12px;color:${MUTED_COLOR};font-style:italic;">No API token activity in the last 24 hours.</td></tr>`
    : topMostPopularApis
        .map((a, i) => {
          return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;width:48px;">#${i + 1}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};">${escapeHtml(a.api_server_name)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};font-family:monospace;font-size:12px;color:${MUTED_COLOR};">${escapeHtml(a.api_server_id)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;text-align:right;">${a.access_token_count.toLocaleString("en-US")}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;text-align:right;">${a.refresh_token_count.toLocaleString("en-US")}</td>
</tr>`;
        })
        .join("\n");

  const errorsRows = newErrors.length === 0
    ? `<tr><td colspan="4" style="padding:12px;color:${MUTED_COLOR};font-style:italic;">No new errors in the last 24 hours.</td></tr>`
    : newErrors
        .map((e) => {
          const link = `${authServerUri}/admin/errors/${encodeURIComponent(e.error_id)}`;
          const route = e.route ? escapeHtml(e.route) : "—";
          return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};"><a href="${link}" style="color:${BRAND_BLUE};text-decoration:none;font-family:monospace;font-size:12px;">${escapeHtml(e.error_id)}</a></td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};"><strong>${escapeHtml(e.name)}</strong>: ${escapeHtml(e.message)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${MUTED_COLOR};font-size:13px;">${route}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${MUTED_COLOR};font-size:13px;">${formatTimestamp(e.created_at)}</td>
</tr>`;
        })
        .join("\n");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${TEXT_COLOR};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid ${BORDER_COLOR};">
    <tr>
      <td style="padding:24px 32px;border-bottom:4px solid ${BRAND_BLUE};">
        <h1 style="margin:0;font-size:22px;color:${BRAND_BLUE};">${escapeHtml(friendlyName)} Daily Admin Report</h1>
        <p style="margin:6px 0 0;color:${MUTED_COLOR};font-size:13px;">${escapeHtml(windowLabel)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 32px;">
        <h2 style="margin:0 0 12px;font-size:16px;color:${BRAND_BLUE};">New sign-ups (${newUsers.length})</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">UID</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Email</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Created at</th>
            </tr>
          </thead>
          <tbody>
${usersRows}
          </tbody>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 24px;">
        <h2 style="margin:0 0 12px;font-size:16px;color:${BRAND_BLUE};">New organizations (${newOrganizations.length})</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Organization ID</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Name</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Created at</th>
            </tr>
          </thead>
          <tbody>
${organizationsRows}
          </tbody>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 24px;">
        <h2 style="margin:0 0 12px;font-size:16px;color:${BRAND_BLUE};">Top most-active users (${topMostActiveUsers.length})</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Rank</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">UID</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Email</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Sign-ins</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Access tokens</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Refresh tokens</th>
            </tr>
          </thead>
          <tbody>
${topMostActiveRows}
          </tbody>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 24px;">
        <h2 style="margin:0 0 12px;font-size:16px;color:${BRAND_BLUE};">Most popular applications (${topMostPopularApps.length})</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Rank</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Application</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Client app ID</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Access tokens</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Refresh tokens</th>
            </tr>
          </thead>
          <tbody>
${topPopularAppsRows}
          </tbody>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 24px;">
        <h2 style="margin:0 0 12px;font-size:16px;color:${BRAND_BLUE};">Most popular APIs (${topMostPopularApis.length})</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Rank</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">API</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Audience (API server ID)</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Access tokens</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${BRAND_BLUE};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Refresh tokens</th>
            </tr>
          </thead>
          <tbody>
${topPopularApisRows}
          </tbody>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 24px;">
        <h2 style="margin:0 0 12px;font-size:16px;color:${BRAND_RED};">New errors (${newErrors.length})</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_RED};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Error ID</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_RED};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Message</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_RED};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Route</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${BRAND_RED};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Created at</th>
            </tr>
          </thead>
          <tbody>
${errorsRows}
          </tbody>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines: string[] = [];
  textLines.push(`${friendlyName} Daily Admin Report`);
  textLines.push(windowLabel);
  textLines.push("");
  textLines.push(`New sign-ups (${newUsers.length}):`);
  if (newUsers.length === 0) {
    textLines.push("  (none)");
  } else {
    for (const u of newUsers) {
      textLines.push(
        `  - ${u.email} — ${formatTimestamp(u.created_at)} — ${authServerUri}/admin/users/${u.uid}`,
      );
    }
  }
  textLines.push("");
  textLines.push(`New organizations (${newOrganizations.length}):`);
  if (newOrganizations.length === 0) {
    textLines.push("  (none)");
  } else {
    for (const o of newOrganizations) {
      textLines.push(
        `  - ${o.name} [${o.organization_id}] — ${formatTimestamp(o.created_at)} — ${authServerUri}/org/${o.organization_id}`,
      );
    }
  }
  textLines.push("");
  textLines.push(`Top most-active users (${topMostActiveUsers.length}):`);
  if (topMostActiveUsers.length === 0) {
    textLines.push("  (none)");
  } else {
    topMostActiveUsers.forEach((u, i) => {
      textLines.push(
        `  ${i + 1}. ${u.email} — ${u.sign_in_count.toLocaleString("en-US")} sign-in(s) — ${u.access_token_count.toLocaleString("en-US")} access / ${u.refresh_token_count.toLocaleString("en-US")} refresh — ${authServerUri}/admin/users/${u.uid}`,
      );
    });
  }
  textLines.push("");
  textLines.push(`Most popular applications (${topMostPopularApps.length}):`);
  if (topMostPopularApps.length === 0) {
    textLines.push("  (none)");
  } else {
    topMostPopularApps.forEach((a, i) => {
      textLines.push(
        `  ${i + 1}. ${a.app_name} [${a.client_app_id}] — ${a.access_token_count.toLocaleString("en-US")} access / ${a.refresh_token_count.toLocaleString("en-US")} refresh`,
      );
    });
  }
  textLines.push("");
  textLines.push(`Most popular APIs (${topMostPopularApis.length}):`);
  if (topMostPopularApis.length === 0) {
    textLines.push("  (none)");
  } else {
    topMostPopularApis.forEach((a, i) => {
      textLines.push(
        `  ${i + 1}. ${a.api_server_name} [${a.api_server_id}] — ${a.access_token_count.toLocaleString("en-US")} access / ${a.refresh_token_count.toLocaleString("en-US")} refresh`,
      );
    });
  }
  textLines.push("");
  textLines.push(`New errors (${newErrors.length}):`);
  if (newErrors.length === 0) {
    textLines.push("  (none)");
  } else {
    for (const e of newErrors) {
      textLines.push(
        `  - ${e.name}: ${e.message} (${e.route ?? "—"}) — ${formatTimestamp(e.created_at)} — ${authServerUri}/admin/errors/${e.error_id}`,
      );
    }
  }

  return { text: textLines.join("\n"), html };
}

export default buildDailyAdminReport;
