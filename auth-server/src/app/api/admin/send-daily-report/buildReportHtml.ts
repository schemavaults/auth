import "server-only";
import type { OrganizationDefinition } from "@schemavaults/auth-common";
import type { TopMostActiveUserRow, UserDocument } from "@/lib/auth-db/users";
import type { ErrorRow } from "@/lib/auth-db/errors";
import type { TopMostPopularAppRow } from "@/lib/auth-db/apps";
import type { TopMostPopularApiRow } from "@/lib/auth-db/apis";
import type {
  ClientErrorAppStats,
  ClientErrorGroupStats,
  ClientErrorStats,
} from "@/lib/auth-db/client-errors";
import type { ClientErrorStorageStatus } from "@/lib/client-errors/row-size";
import { formatBytes } from "@/lib/format-bytes";
import {
  clientErrorPageFiltersToSearchParams,
  DEFAULT_CLIENT_ERROR_PAGE_FILTERS,
  type ClientErrorPageFilters,
} from "@/lib/client-errors/client-error-page-filters";

/** The client error reports received during the report window, summarized. */
export interface DailyReportClientErrors {
  /** `getClientErrorStats()` over the report window. */
  stats: ClientErrorStats;
  /** Intake settings and storage use, as of the report. */
  storage: ClientErrorStorageStatus;
  /** Names of the apps in `stats.by_app`, keyed by client app id (missing: the id is shown). */
  appNames: ReadonlyMap<string, string>;
}

interface BuildReportOpts {
  authServerUri: string;
  /** White-label deployment name rendered in the report heading. */
  friendlyName: string;
  /**
   * Inlined CSS color of the header, section headings and links: the
   * deployment's theme accent, from `getAuthServerEmailAccentColor()`.
   */
  accentColor: string;
  windowStart: Date;
  windowEnd: Date;
  newUsers: readonly UserDocument[];
  newOrganizations: readonly OrganizationDefinition[];
  newErrors: readonly ErrorRow[];
  topMostActiveUsers: readonly TopMostActiveUserRow[];
  topMostPopularApps: readonly TopMostPopularAppRow[];
  topMostPopularApis: readonly TopMostPopularApiRow[];
  /**
   * The auth server's own api server id. Refresh tokens are only ever minted
   * with the auth server itself as their audience, so the refresh-token count
   * is meaningless (always 0) for every other API and is rendered as "N/A".
   */
  authServerApiServerId: string;
  clientErrors: DailyReportClientErrors;
}

interface ReportContent {
  text: string;
  html: string;
}

/**
 * Errors and warnings stay red whatever the deployment's theme colors: the
 * color marks a status, not the brand.
 */
const ALERT_COLOR = "#dc2626";
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

/** Admin console pages the report links to, in the order of the footer's quick links. */
const ADMIN_PAGES = {
  dashboard: { path: "/admin", label: "Dashboard" },
  users: { path: "/admin/users", label: "Users" },
  organizations: { path: "/admin/organizations", label: "Organizations" },
  apps: { path: "/admin/apps", label: "Applications" },
  apis: { path: "/admin/apis", label: "APIs" },
  errors: { path: "/admin/errors", label: "Server errors" },
  client_errors: { path: "/admin/client-errors", label: "Client errors" },
  traces: { path: "/admin/traces", label: "Traces" },
  settings: { path: "/admin/settings", label: "Settings" },
} as const satisfies Record<string, { path: string; label: string }>;

type AdminPage = keyof typeof ADMIN_PAGES;

const ADMIN_PAGE_ORDER = Object.keys(ADMIN_PAGES) as AdminPage[];

/** Error groups and applications the client errors section lists at most; the dashboard has the rest. */
export const DAILY_REPORT_CLIENT_ERROR_TOP_N: number = 5;

/** Longest client error name / message the report quotes (reports allow far longer ones). */
const CLIENT_ERROR_NAME_MAX_LENGTH: number = 100;
const CLIENT_ERROR_MESSAGE_MAX_LENGTH: number = 200;

/** Share of the storage limit (percent) from which the report flags the client error storage. */
const CLIENT_ERROR_STORAGE_WARNING_PERCENT: number = 80;

/**
 * The client errors dashboard showing the last 24 hours (the report's window,
 * as of when the administrator opens it), optionally narrowed to one app or
 * error group.
 */
function clientErrorsDashboardUrl(
  authServerUri: string,
  filters: Partial<Pick<ClientErrorPageFilters, "client_app_id" | "fingerprint">> = {},
): string {
  const params: URLSearchParams = clientErrorPageFiltersToSearchParams({
    ...DEFAULT_CLIENT_ERROR_PAGE_FILTERS,
    range: "24h",
    ...filters,
  });
  return `${authServerUri}${ADMIN_PAGES.client_errors.path}?${params.toString()}`;
}

/** A link to `href` in the accent color; `labelHtml` must already be escaped. */
function linkHtml(accentColor: string, href: string, labelHtml: string, style: string = ""): string {
  return `<a href="${escapeHtml(href)}" style="color:${accentColor};text-decoration:none;${style}">${labelHtml}</a>`;
}

/** A section heading (in `color`) with a link to the admin page holding the full picture. */
function sectionHeadingHtml(
  accentColor: string,
  title: string,
  href: string,
  linkLabel: string,
  color: string = accentColor,
): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
          <tr>
            <td align="left" valign="bottom"><h2 style="margin:0;font-size:16px;color:${color};">${escapeHtml(title)}</h2></td>
            <td align="right" valign="bottom" style="padding-left:12px;white-space:nowrap;">${linkHtml(accentColor, href, `${escapeHtml(linkLabel)} &rarr;`, "font-size:13px;")}</td>
          </tr>
        </table>`;
}

function headerCellHtml(label: string, color: string, align: "left" | "right" = "left"): string {
  return `<th align="${align}" style="padding:8px 12px;border-bottom:2px solid ${color};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(label)}</th>`;
}

function countCellHtml(value: number): string {
  return `<td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;text-align:right;">${value.toLocaleString("en-US")}</td>`;
}

/** `1 report`, `1,284 reports`. */
function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

/** `value` on one line, cut to `maxLength` characters. */
function truncateOneLine(value: string, maxLength: number): string {
  const line: string = value.replace(/\s+/g, " ").trim();
  return line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line;
}

/** `+12 vs. previous 24h (30)`; null when there is no previous period to compare with. */
function describeChange(current: number, previous: number | null): string | null {
  if (previous === null) return null;
  const diff: number = current - previous;
  const sign: string = diff > 0 ? "+" : diff < 0 ? "-" : "±";
  return `${sign}${Math.abs(diff).toLocaleString("en-US")} vs. previous 24h (${previous.toLocaleString("en-US")})`;
}

function statTileHtml(value: number, label: string, note: { text: string; color: string } | null = null): string {
  const noteHtml: string = note
    ? `\n                <div style="margin-top:6px;font-size:12px;color:${note.color};">${escapeHtml(note.text)}</div>`
    : "";
  return `<td width="25%" valign="top" style="padding:12px;background:#f9fafb;border:1px solid ${BORDER_COLOR};border-radius:6px;">
                <div style="font-size:22px;font-weight:700;color:${TEXT_COLOR};">${value.toLocaleString("en-US")}</div>
                <div style="margin-top:2px;font-size:11px;color:${MUTED_COLOR};text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(label)}</div>${noteHtml}
              </td>`;
}

interface ClientErrorIntakeSummary {
  status: string;
  /** New reports are being refused although the intake is on. */
  refusingReports: boolean;
  storage: string;
  /** Storage use is at or above {@link CLIENT_ERROR_STORAGE_WARNING_PERCENT}. */
  storageNearlyFull: boolean;
  retention: string;
}

function summarizeClientErrorIntake(storage: ClientErrorStorageStatus): ClientErrorIntakeSummary {
  const full: boolean = storage.used_bytes >= storage.max_bytes;
  // Rounded down so a store that still accepts reports never reads 100%.
  const percent: number = storage.max_bytes > 0
    ? Math.min(100, Math.floor((storage.used_bytes / storage.max_bytes) * 100))
    : 100;
  return {
    status: !storage.accepting_reports
      ? "Not accepting reports"
      : full
        ? "Storage full: new reports are refused"
        : "Accepting reports",
    refusingReports: storage.accepting_reports && full,
    storage: `${formatBytes(storage.used_bytes)} of ${formatBytes(storage.max_bytes)} used (${percent}%)`,
    storageNearlyFull: full || percent >= CLIENT_ERROR_STORAGE_WARNING_PERCENT,
    retention: storage.retention_days > 0
      ? `Reports are deleted after ${pluralize(storage.retention_days, "day")}`
      : "Reports are kept until an administrator deletes them",
  };
}

interface ReportSection {
  html: string;
  text: readonly string[];
}

/** Summary statistics of the client error reports received during the window; the details stay on the dashboard. */
function buildClientErrorsSection(
  authServerUri: string,
  accentColor: string,
  { stats, storage, appNames }: DailyReportClientErrors,
): ReportSection {
  const { totals } = stats;
  const dashboardUrl: string = clientErrorsDashboardUrl(authServerUri);
  const settingsUrl: string = `${authServerUri}${ADMIN_PAGES.settings.path}`;
  const intake: ClientErrorIntakeSummary = summarizeClientErrorIntake(storage);
  const change: string | null = describeChange(totals.errors, totals.previous_period_errors);
  const increased: boolean = totals.previous_period_errors !== null && totals.errors > totals.previous_period_errors;
  const groups: readonly ClientErrorGroupStats[] = stats.top_groups.slice(0, DAILY_REPORT_CLIENT_ERROR_TOP_N);
  const apps: readonly ClientErrorAppStats[] = stats.by_app.slice(0, DAILY_REPORT_CLIENT_ERROR_TOP_N);
  const moreGroups: number = Math.max(0, totals.groups - groups.length);
  const moreApps: number = Math.max(0, totals.apps - apps.length);

  const groupUrl = (g: ClientErrorGroupStats): string =>
    clientErrorsDashboardUrl(authServerUri, { fingerprint: g.fingerprint });
  const appUrl = (a: ClientErrorAppStats): string =>
    clientErrorsDashboardUrl(authServerUri, { client_app_id: a.client_app_id });
  const appName = (a: ClientErrorAppStats): string | null => {
    const name: string | undefined = appNames.get(a.client_app_id);
    return name && name !== a.client_app_id ? name : null;
  };
  const groupName = (g: ClientErrorGroupStats): string => truncateOneLine(g.name, CLIENT_ERROR_NAME_MAX_LENGTH);
  const groupMessage = (g: ClientErrorGroupStats): string =>
    truncateOneLine(g.message, CLIENT_ERROR_MESSAGE_MAX_LENGTH);

  const previousNote: string = totals.previous_period_errors
    ? ` (${pluralize(totals.previous_period_errors, "report")} in the previous 24 hours)`
    : "";

  let bodyHtml: string;
  if (totals.errors === 0) {
    bodyHtml = `<p style="margin:0;padding:12px;color:${MUTED_COLOR};font-style:italic;">No client errors were reported in the last 24 hours${escapeHtml(previousNote)}.</p>`;
  } else {
    const groupRows: string = groups
      .map((g) => {
        const message: string = groupMessage(g);
        const label: string = `<strong>${escapeHtml(groupName(g))}</strong>${message ? `: ${escapeHtml(message)}` : ""}`;
        const operation: string = g.operation
          ? `<div style="margin-top:2px;font-family:monospace;font-size:12px;color:${MUTED_COLOR};">${escapeHtml(truncateOneLine(g.operation, CLIENT_ERROR_NAME_MAX_LENGTH))}</div>`
          : "";
        return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};">${linkHtml(accentColor, groupUrl(g), label)}${operation}</td>
  ${countCellHtml(g.count)}
  ${countCellHtml(g.apps)}
  ${countCellHtml(g.users)}
</tr>`;
      })
      .join("\n");

    const appRows: string = apps
      .map((a) => {
        const name: string | null = appName(a);
        const label: string = name
          ? `${linkHtml(accentColor, appUrl(a), escapeHtml(name))}<div style="margin-top:2px;font-family:monospace;font-size:12px;color:${MUTED_COLOR};">${escapeHtml(a.client_app_id)}</div>`
          : linkHtml(accentColor, appUrl(a), escapeHtml(a.client_app_id), "font-family:monospace;font-size:12px;");
        return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};">${label}</td>
  ${countCellHtml(a.count)}
  ${countCellHtml(a.groups)}
</tr>`;
      })
      .join("\n");

    const moreNote = (count: number, singular: string): string =>
      count > 0
        ? `\n        <p style="margin:8px 0 0;font-size:12px;">${linkHtml(accentColor, dashboardUrl, `+${escapeHtml(pluralize(count, `more ${singular}`))} on the dashboard`)}</p>`
        : "";

    bodyHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px 0;">
          <tr>
              ${statTileHtml(totals.errors, "Reports", change ? { text: change, color: increased ? ALERT_COLOR : MUTED_COLOR } : null)}
              ${statTileHtml(totals.groups, "Error groups")}
              ${statTileHtml(totals.apps, "Applications")}
              ${statTileHtml(totals.users, "Users affected")}
          </tr>
        </table>
        <h3 style="margin:20px 0 8px;font-size:14px;color:${TEXT_COLOR};">Top error groups</h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              ${headerCellHtml("Error", ALERT_COLOR)}
              ${headerCellHtml("Reports", ALERT_COLOR, "right")}
              ${headerCellHtml("Apps", ALERT_COLOR, "right")}
              ${headerCellHtml("Users", ALERT_COLOR, "right")}
            </tr>
          </thead>
          <tbody>
${groupRows}
          </tbody>
        </table>${moreNote(moreGroups, "error group")}
        <h3 style="margin:20px 0 8px;font-size:14px;color:${TEXT_COLOR};">By application</h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              ${headerCellHtml("Application", ALERT_COLOR)}
              ${headerCellHtml("Reports", ALERT_COLOR, "right")}
              ${headerCellHtml("Error groups", ALERT_COLOR, "right")}
            </tr>
          </thead>
          <tbody>
${appRows}
          </tbody>
        </table>${moreNote(moreApps, "application")}`;
  }

  const html = `<tr>
      <td style="padding:8px 32px 24px;">
        ${sectionHeadingHtml(accentColor, `Client errors (${totals.errors.toLocaleString("en-US")})`, dashboardUrl, "Client errors dashboard", ALERT_COLOR)}
        <p style="margin:0 0 12px;color:${MUTED_COLOR};font-size:13px;">Errors that client applications reported to the auth server.</p>
        ${bodyHtml}
        <p style="margin:16px 0 0;color:${MUTED_COLOR};font-size:12px;line-height:1.6;">
          Intake: <strong style="color:${intake.refusingReports ? ALERT_COLOR : TEXT_COLOR};">${escapeHtml(intake.status)}</strong>
          &middot; Storage: <span style="${intake.storageNearlyFull ? `color:${ALERT_COLOR};font-weight:600;` : ""}">${escapeHtml(intake.storage)}</span>
          &middot; ${escapeHtml(intake.retention)}
          &middot; ${linkHtml(accentColor, settingsUrl, "Settings")}
        </p>
      </td>
    </tr>`;

  const text: string[] = [];
  text.push(`Client errors (${totals.errors.toLocaleString("en-US")}):`);
  text.push(`  → Client errors dashboard: ${dashboardUrl}`);
  if (totals.errors === 0) {
    text.push(`  (none${previousNote})`);
  } else {
    text.push(
      `  ${pluralize(totals.errors, "report")}${change ? ` (${change})` : ""} · ${pluralize(totals.groups, "error group")} · ${pluralize(totals.apps, "application")} · ${pluralize(totals.users, "user")} affected`,
    );
    text.push("  Top error groups:");
    groups.forEach((g, i) => {
      const message: string = groupMessage(g);
      text.push(
        `    ${i + 1}. ${groupName(g)}${message ? `: ${message}` : ""}${g.operation ? ` [${truncateOneLine(g.operation, CLIENT_ERROR_NAME_MAX_LENGTH)}]` : ""} — ${pluralize(g.count, "report")}, ${pluralize(g.apps, "app")}, ${pluralize(g.users, "user")} — ${groupUrl(g)}`,
      );
    });
    if (moreGroups > 0) text.push(`    (+${pluralize(moreGroups, "more error group")} on the dashboard)`);
    text.push("  By application:");
    apps.forEach((a, i) => {
      const name: string | null = appName(a);
      text.push(
        `    ${i + 1}. ${name ? `${name} [${a.client_app_id}]` : a.client_app_id} — ${pluralize(a.count, "report")}, ${pluralize(a.groups, "error group")} — ${appUrl(a)}`,
      );
    });
    if (moreApps > 0) text.push(`    (+${pluralize(moreApps, "more application")} on the dashboard)`);
  }
  text.push(`  Intake: ${intake.status} · Storage: ${intake.storage} · ${intake.retention} — ${settingsUrl}`);

  return { html, text };
}

export function buildDailyAdminReport({
  authServerUri,
  friendlyName,
  accentColor,
  windowStart,
  windowEnd,
  newUsers,
  newOrganizations,
  newErrors,
  topMostActiveUsers,
  topMostPopularApps,
  topMostPopularApis,
  authServerApiServerId,
  clientErrors,
}: BuildReportOpts): ReportContent {
  const adminUrl = (page: AdminPage): string => `${authServerUri}${ADMIN_PAGES[page].path}`;
  const clientErrorsSection: ReportSection = buildClientErrorsSection(authServerUri, accentColor, clientErrors);
  const windowLabel = `${formatTimestamp(windowStart.getTime())} → ${formatTimestamp(windowEnd.getTime())}`;

  /**
   * Only the auth server's own audience can accumulate refresh tokens, so a
   * refresh-token count is only meaningful on that row.
   */
  const isAuthServerAudience = (a: TopMostPopularApiRow): boolean =>
    a.api_server_id === authServerApiServerId;

  const usersRows = newUsers.length === 0
    ? `<tr><td colspan="3" style="padding:12px;color:${MUTED_COLOR};font-style:italic;">No new sign-ups in the last 24 hours.</td></tr>`
    : newUsers
        .map((u) => {
          const link = `${authServerUri}/admin/users/${encodeURIComponent(u.uid)}`;
          return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};font-family:monospace;font-size:12px;color:${MUTED_COLOR};">${escapeHtml(u.uid)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};"><a href="${link}" style="color:${accentColor};text-decoration:none;">${escapeHtml(u.email)}</a></td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${MUTED_COLOR};font-size:13px;">${formatTimestamp(u.created_at)}</td>
</tr>`;
        })
        .join("\n");

  const organizationsRows = newOrganizations.length === 0
    ? `<tr><td colspan="3" style="padding:12px;color:${MUTED_COLOR};font-style:italic;">No new organizations in the last 24 hours.</td></tr>`
    : newOrganizations
        .map((o) => {
          const link = `${authServerUri}/orgs/${encodeURIComponent(o.organization_id)}`;
          return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};font-family:monospace;font-size:12px;color:${MUTED_COLOR};">${escapeHtml(o.organization_id)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};"><a href="${link}" style="color:${accentColor};text-decoration:none;">${escapeHtml(o.name)}</a></td>
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
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};"><a href="${link}" style="color:${accentColor};text-decoration:none;">${escapeHtml(u.email)}</a></td>
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
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};">${linkHtml(accentColor, `${authServerUri}/apps/${encodeURIComponent(a.client_app_id)}`, escapeHtml(a.app_name))}</td>
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
          const refreshCell = isAuthServerAudience(a)
            ? `<td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;text-align:right;">${a.refresh_token_count.toLocaleString("en-US")}</td>`
            : `<td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${MUTED_COLOR};text-align:right;" title="Refresh tokens are only issued for the auth server audience.">N/A</td>`;
          return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;width:48px;">#${i + 1}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};">${linkHtml(accentColor, `${authServerUri}/apis/${encodeURIComponent(a.api_server_id)}`, escapeHtml(a.api_server_name))}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};font-family:monospace;font-size:12px;color:${MUTED_COLOR};">${escapeHtml(a.api_server_id)}</td>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};color:${TEXT_COLOR};font-weight:600;text-align:right;">${a.access_token_count.toLocaleString("en-US")}</td>
  ${refreshCell}
</tr>`;
        })
        .join("\n");

  const errorsRows = newErrors.length === 0
    ? `<tr><td colspan="4" style="padding:12px;color:${MUTED_COLOR};font-style:italic;">No new server errors in the last 24 hours.</td></tr>`
    : newErrors
        .map((e) => {
          const link = `${authServerUri}/admin/errors/${encodeURIComponent(e.error_id)}`;
          const route = e.route ? escapeHtml(e.route) : "—";
          return `<tr>
  <td style="padding:8px 12px;border-bottom:1px solid ${BORDER_COLOR};"><a href="${link}" style="color:${accentColor};text-decoration:none;font-family:monospace;font-size:12px;">${escapeHtml(e.error_id)}</a></td>
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
      <td style="padding:24px 32px;border-bottom:4px solid ${accentColor};">
        <h1 style="margin:0;font-size:22px;color:${accentColor};">${escapeHtml(friendlyName)} Daily Admin Report</h1>
        <p style="margin:6px 0 0;color:${MUTED_COLOR};font-size:13px;">${escapeHtml(windowLabel)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 32px;">
        ${sectionHeadingHtml(accentColor, `New sign-ups (${newUsers.length})`, adminUrl("users"), "All users")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">UID</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Email</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Created at</th>
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
        ${sectionHeadingHtml(accentColor, `New organizations (${newOrganizations.length})`, adminUrl("organizations"), "All organizations")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Organization ID</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Name</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Created at</th>
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
        ${sectionHeadingHtml(accentColor, `Top most-active users (${topMostActiveUsers.length})`, adminUrl("users"), "All users")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Rank</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">UID</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Email</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Sign-ins</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Access tokens</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Refresh tokens</th>
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
        ${sectionHeadingHtml(accentColor, `Most popular applications (${topMostPopularApps.length})`, adminUrl("apps"), "All applications")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Rank</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Application</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Client app ID</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Access tokens</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Refresh tokens</th>
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
        ${sectionHeadingHtml(accentColor, `Most popular APIs (${topMostPopularApis.length})`, adminUrl("apis"), "All APIs")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Rank</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">API</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Audience (API server ID)</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Access tokens</th>
              <th align="right" style="padding:8px 12px;border-bottom:2px solid ${accentColor};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Refresh tokens</th>
            </tr>
          </thead>
          <tbody>
${topPopularApisRows}
          </tbody>
        </table>
        <p style="margin:8px 0 0;color:${MUTED_COLOR};font-size:12px;">Refresh tokens are only issued with the auth server itself as their audience, so the refresh-token count is not applicable (&ldquo;N/A&rdquo;) for other APIs.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 32px 24px;">
        ${sectionHeadingHtml(accentColor, `New server errors (${newErrors.length})`, adminUrl("errors"), "All server errors", ALERT_COLOR)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${ALERT_COLOR};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Error ID</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${ALERT_COLOR};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Message</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${ALERT_COLOR};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Route</th>
              <th align="left" style="padding:8px 12px;border-bottom:2px solid ${ALERT_COLOR};color:${TEXT_COLOR};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Created at</th>
            </tr>
          </thead>
          <tbody>
${errorsRows}
          </tbody>
        </table>
      </td>
    </tr>
    ${clientErrorsSection.html}
    <tr>
      <td style="padding:16px 32px 24px;border-top:1px solid ${BORDER_COLOR};color:${MUTED_COLOR};font-size:12px;line-height:1.8;">
        <strong style="color:${TEXT_COLOR};">Admin console:</strong>
        ${ADMIN_PAGE_ORDER.map((page) => linkHtml(accentColor, adminUrl(page), escapeHtml(ADMIN_PAGES[page].label))).join(" &middot; ")}
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
  textLines.push(`  → All users: ${adminUrl("users")}`);
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
  textLines.push(`  → All organizations: ${adminUrl("organizations")}`);
  if (newOrganizations.length === 0) {
    textLines.push("  (none)");
  } else {
    for (const o of newOrganizations) {
      textLines.push(
        `  - ${o.name} [${o.organization_id}] — ${formatTimestamp(o.created_at)} — ${authServerUri}/orgs/${o.organization_id}`,
      );
    }
  }
  textLines.push("");
  textLines.push(`Top most-active users (${topMostActiveUsers.length}):`);
  textLines.push(`  → All users: ${adminUrl("users")}`);
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
  textLines.push(`  → All applications: ${adminUrl("apps")}`);
  if (topMostPopularApps.length === 0) {
    textLines.push("  (none)");
  } else {
    topMostPopularApps.forEach((a, i) => {
      textLines.push(
        `  ${i + 1}. ${a.app_name} [${a.client_app_id}] — ${a.access_token_count.toLocaleString("en-US")} access / ${a.refresh_token_count.toLocaleString("en-US")} refresh — ${authServerUri}/apps/${a.client_app_id}`,
      );
    });
  }
  textLines.push("");
  textLines.push(`Most popular APIs (${topMostPopularApis.length}):`);
  textLines.push(`  → All APIs: ${adminUrl("apis")}`);
  if (topMostPopularApis.length === 0) {
    textLines.push("  (none)");
  } else {
    topMostPopularApis.forEach((a, i) => {
      const refreshLabel = isAuthServerAudience(a)
        ? `${a.refresh_token_count.toLocaleString("en-US")} refresh`
        : "N/A refresh";
      textLines.push(
        `  ${i + 1}. ${a.api_server_name} [${a.api_server_id}] — ${a.access_token_count.toLocaleString("en-US")} access / ${refreshLabel} — ${authServerUri}/apis/${a.api_server_id}`,
      );
    });
    textLines.push(
      "  (Refresh tokens are only issued with the auth server itself as their audience.)",
    );
  }
  textLines.push("");
  textLines.push(`New server errors (${newErrors.length}):`);
  textLines.push(`  → All server errors: ${adminUrl("errors")}`);
  if (newErrors.length === 0) {
    textLines.push("  (none)");
  } else {
    for (const e of newErrors) {
      textLines.push(
        `  - ${e.name}: ${e.message} (${e.route ?? "—"}) — ${formatTimestamp(e.created_at)} — ${authServerUri}/admin/errors/${e.error_id}`,
      );
    }
  }
  textLines.push("");
  textLines.push(...clientErrorsSection.text);
  textLines.push("");
  textLines.push("Admin console:");
  for (const page of ADMIN_PAGE_ORDER) {
    textLines.push(`  ${ADMIN_PAGES[page].label}: ${adminUrl(page)}`);
  }

  return { text: textLines.join("\n"), html };
}

export default buildDailyAdminReport;
