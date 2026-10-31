import { describe, expect, test } from "bun:test";
import type { ClientErrorGroupStats, ClientErrorStats } from "@/lib/auth-db/client-errors";
import type { ClientErrorStorageStatus } from "@/lib/client-errors/row-size";
import type { OrganizationMfaDailyReport } from "@/lib/auth-db/organization-mfa-requirements";
import { buildDailyAdminReport, DAILY_REPORT_CLIENT_ERROR_TOP_N, type DailyReportClientErrors } from "./buildReportHtml";

const AUTH_SERVER_URI = "https://auth.example.com";
const AUTH_SERVER_API_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "22222222-2222-4222-8222-222222222222";
const UNNAMED_APP_ID = "33333333-3333-4333-8333-333333333333";
const API_ID = "44444444-4444-4444-8444-444444444444";
const WINDOW_END = new Date("2026-10-04T12:00:00.000Z");
const WINDOW_START = new Date(WINDOW_END.getTime() - 24 * 60 * 60 * 1000);
const MB = 1024 * 1024;
const ACCENT_COLOR = "#7c3aed";

function fingerprint(i: number): string {
  return i.toString(16).padStart(32, "0");
}

function group(i: number, overrides: Partial<ClientErrorGroupStats> = {}): ClientErrorGroupStats {
  return {
    fingerprint: fingerprint(i),
    name: "TypeError",
    message: `failure number ${i}`,
    operation: "acquireAccessToken",
    latest_client_error_id: `55555555-5555-4555-8555-${String(i).padStart(12, "0")}`,
    count: 10 - i,
    apps: 1,
    users: 2,
    first_seen: WINDOW_START.getTime(),
    last_seen: WINDOW_END.getTime(),
    ...overrides,
  };
}

function stats(overrides: Partial<ClientErrorStats> = {}): ClientErrorStats {
  return {
    window: { from: WINDOW_START.getTime(), to: WINDOW_END.getTime(), bucket_ms: 60 * 60 * 1000 },
    totals: {
      errors: 42,
      groups: 7,
      apps: 2,
      users: 9,
      first_seen: WINDOW_START.getTime(),
      last_seen: WINDOW_END.getTime(),
      previous_period_errors: 30,
    },
    timeline: [],
    top_groups: Array.from({ length: 7 }, (_, i) => group(i)),
    by_app: [
      { client_app_id: APP_ID, count: 40, groups: 6, last_seen: WINDOW_END.getTime() },
      { client_app_id: UNNAMED_APP_ID, count: 2, groups: 1, last_seen: WINDOW_END.getTime() },
    ],
    by_sdk_version: [],
    by_operation: [],
    ...overrides,
  };
}

const STORAGE: ClientErrorStorageStatus = {
  accepting_reports: true,
  used_bytes: 3 * MB,
  max_bytes: 100 * MB,
  retention_days: 30,
};

/** No organization requires MFA: the section is left out. */
const NO_ORGANIZATION_MFA: OrganizationMfaDailyReport = {
  organizations_requiring_mfa: 0,
  removals: [],
  removals_total: 0,
  in_grace_period: 0,
  awaiting_removal: 0,
  not_notified: 0,
  upcoming_removals: [],
  upcoming_removals_total: 0,
};

function build(
  clientErrors: Partial<DailyReportClientErrors> = {},
  organizationMfa: Partial<OrganizationMfaDailyReport> = {},
) {
  return buildDailyAdminReport({
    authServerUri: AUTH_SERVER_URI,
    friendlyName: "Example Auth",
    accentColor: ACCENT_COLOR,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    newUsers: [],
    newOrganizations: [],
    newErrors: [],
    topMostActiveUsers: [],
    topMostPopularApps: [
      { client_app_id: APP_ID, app_name: "Example App", access_token_count: 5, refresh_token_count: 1 },
    ],
    topMostPopularApis: [
      { api_server_id: API_ID, api_server_name: "Example API", access_token_count: 5, refresh_token_count: 0 },
    ],
    authServerApiServerId: AUTH_SERVER_API_ID,
    clientErrors: {
      stats: stats(),
      storage: STORAGE,
      appNames: new Map([[APP_ID, "Example App"]]),
      ...clientErrors,
    },
    organizationMfa: { ...NO_ORGANIZATION_MFA, ...organizationMfa },
  });
}

describe("buildDailyAdminReport colors", () => {
  test("headings and links use the deployment's accent color, not the default brand blue", () => {
    const { html } = build();
    expect(html).toContain(`<h1 style="margin:0;font-size:22px;color:${ACCENT_COLOR};">Example Auth Daily Admin Report</h1>`);
    expect(html).toContain(`href="${AUTH_SERVER_URI}/apps/${APP_ID}" style="color:${ACCENT_COLOR};`);
    expect(html).not.toContain("#60a5fa");
  });
});

describe("buildDailyAdminReport links", () => {
  test("every section links to the admin page with the full picture", () => {
    const { html, text } = build();
    for (const path of ["/admin/users", "/admin/organizations", "/admin/apps", "/admin/apis", "/admin/errors"]) {
      expect(html).toContain(`href="${AUTH_SERVER_URI}${path}"`);
      expect(text).toContain(`${AUTH_SERVER_URI}${path}`);
    }
    expect(html).toContain(`href="${AUTH_SERVER_URI}/admin/client-errors?range=24h"`);
    expect(text).toContain(`Client errors dashboard: ${AUTH_SERVER_URI}/admin/client-errors?range=24h`);
  });

  test("the footer links to every admin console page", () => {
    const { html, text } = build();
    const lines: string[] = text.split("\n");
    for (const [label, path] of [
      ["Dashboard", "/admin"],
      ["Client errors", "/admin/client-errors"],
      ["Traces", "/admin/traces"],
      ["Settings", "/admin/settings"],
    ] as const) {
      expect(html).toContain(`href="${AUTH_SERVER_URI}${path}"`);
      expect(lines).toContain(`  ${label}: ${AUTH_SERVER_URI}${path}`);
    }
  });

  test("popular applications and APIs link to their detail pages", () => {
    const { html, text } = build();
    expect(html).toContain(`href="${AUTH_SERVER_URI}/apps/${APP_ID}"`);
    expect(html).toContain(`href="${AUTH_SERVER_URI}/apis/${API_ID}"`);
    expect(text).toContain(`${AUTH_SERVER_URI}/apps/${APP_ID}`);
    expect(text).toContain(`${AUTH_SERVER_URI}/apis/${API_ID}`);
  });
});

describe("buildDailyAdminReport client errors", () => {
  test("summarizes the totals and the change from the previous period", () => {
    const { html, text } = build();
    expect(html).toContain("Client errors (42)");
    expect(html).toContain("+12 vs. previous 24h (30)");
    expect(text).toContain(
      "42 reports (+12 vs. previous 24h (30)) · 7 error groups · 2 applications · 9 users affected",
    );
  });

  test("lists the top groups, each linking to the dashboard filtered to it", () => {
    const { html, text } = build();
    for (let i = 0; i < DAILY_REPORT_CLIENT_ERROR_TOP_N; i++) {
      expect(html).toContain(`href="${AUTH_SERVER_URI}/admin/client-errors?range=24h&amp;group=${fingerprint(i)}"`);
      expect(text).toContain(`${AUTH_SERVER_URI}/admin/client-errors?range=24h&group=${fingerprint(i)}`);
    }
    expect(html).not.toContain(`group=${fingerprint(DAILY_REPORT_CLIENT_ERROR_TOP_N)}`);
    expect(html).toContain("+2 more error groups on the dashboard");
    expect(text).toContain("(+2 more error groups on the dashboard)");
  });

  test("names the applications it can and shows the id of the others", () => {
    const { html, text } = build();
    expect(html).toContain(`href="${AUTH_SERVER_URI}/admin/client-errors?range=24h&amp;app=${APP_ID}"`);
    expect(html).toContain(`href="${AUTH_SERVER_URI}/admin/client-errors?range=24h&amp;app=${UNNAMED_APP_ID}"`);
    expect(text).toContain(`1. Example App [${APP_ID}] — 40 reports, 6 error groups`);
    expect(text).toContain(`2. ${UNNAMED_APP_ID} — 2 reports, 1 error group`);
  });

  test("escapes report content and keeps it on one, shortened line", () => {
    const { html, text } = build({
      stats: stats({
        top_groups: [group(0, { name: "<img src=x>", message: `line one\nline two ${"x".repeat(300)}` })],
      }),
    });
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;");
    expect(text).toContain("<img src=x>: line one line two x");
    expect(text).not.toContain("x".repeat(200));
  });

  test("says so when nothing was reported", () => {
    const { html, text } = build({
      stats: stats({
        totals: { ...stats().totals, errors: 0, groups: 0, apps: 0, users: 0, previous_period_errors: 3 },
        top_groups: [],
        by_app: [],
      }),
    });
    expect(html).toContain("No client errors were reported in the last 24 hours (3 reports in the previous 24 hours).");
    expect(html).not.toContain("Top error groups");
    expect(text).toContain("(none (3 reports in the previous 24 hours))");
  });

  test("reports the intake status, storage use and retention", () => {
    expect(build().text).toContain(
      `Intake: Accepting reports · Storage: 3 MB of 100 MB used (3%) · Reports are deleted after 30 days — ${AUTH_SERVER_URI}/admin/settings`,
    );
    expect(build({ storage: { ...STORAGE, used_bytes: 100 * MB } }).text).toContain(
      "Intake: Storage full: new reports are refused · Storage: 100 MB of 100 MB used (100%)",
    );
    expect(build({ storage: { ...STORAGE, accepting_reports: false, retention_days: 0 } }).text).toContain(
      "Intake: Not accepting reports · Storage: 3 MB of 100 MB used (3%) · Reports are kept until an administrator deletes them",
    );
  });
});

describe("buildDailyAdminReport organization MFA enforcement", () => {
  const MEMBER_UID = "66666666-6666-4666-8666-666666666666";
  const OTHER_UID = "77777777-7777-4777-8777-777777777777";
  const ORG_ID = "acme-inc";
  const REMOVED_AT = WINDOW_END.getTime() - 16 * 60 * 60 * 1000;

  const removal = {
    organization_id: ORG_ID,
    organization_name: "Acme <Inc>",
    uid: MEMBER_UID,
    email: "removed@example.com",
    role: "owner" as const,
    grace_period_reason: "requirement_enabled" as const,
    grace_period_ended_at: REMOVED_AT - 60 * 60 * 1000,
    removed_at: REMOVED_AT,
  };
  const upcoming = {
    organization_id: ORG_ID,
    organization_name: "Acme <Inc>",
    uid: OTHER_UID,
    email: "soon@example.com",
    ends_at: WINDOW_END.getTime() + 30 * 60 * 60 * 1000,
    notified: false,
  };

  test("is left out while no organization requires MFA and nobody was removed", () => {
    const { html, text } = build();
    expect(html).not.toContain("Organization MFA enforcement");
    expect(text).not.toContain("Organization MFA enforcement");
  });

  test("says so when organizations require MFA but nobody was removed", () => {
    const { html, text } = build({}, { organizations_requiring_mfa: 2 });
    expect(html).toContain("Organization MFA enforcement (0 members removed)");
    expect(html).toContain("2 organizations require multi-factor authentication.");
    expect(html).toContain("No members were removed in the last 24 hours.");
    expect(html).toContain("No grace periods end in the next 72 hours.");
    expect(text).toContain("Organization MFA enforcement (0 members removed):");
    expect(text).toContain(`  → All organizations: ${AUTH_SERVER_URI}/admin/organizations`);
  });

  test("lists each removed member with their organization, role, grace period and links", () => {
    const { html, text } = build({}, {
      organizations_requiring_mfa: 1,
      removals: [removal],
      removals_total: 1,
      in_grace_period: 3,
    });
    expect(html).toContain(`<h2 style="margin:0;font-size:16px;color:#dc2626;">Organization MFA enforcement (1 member removed)</h2>`);
    expect(html).toContain(`href="${AUTH_SERVER_URI}/admin/users/${MEMBER_UID}"`);
    expect(html).toContain(`href="${AUTH_SERVER_URI}/orgs/${ORG_ID}"`);
    expect(html).toContain("Acme &lt;Inc&gt;");
    expect(html).not.toContain("Acme <Inc>");
    expect(html).toContain("had no MFA when the organization required it");
    expect(text).toContain(
      `    - removed@example.com from Acme <Inc> [${ORG_ID}] (owner) — grace period ended 2026-10-03 19:00:00 UTC, had no MFA when the organization required it — removed 2026-10-03 20:00:00 UTC — ${AUTH_SERVER_URI}/admin/users/${MEMBER_UID}`,
    );
    expect(text).toContain("  1 member removed · 3 in a grace period · 0 awaiting removal · 0 not yet emailed");
  });

  test("flags upcoming removals of members who were not warned by email", () => {
    const { html, text } = build({}, {
      organizations_requiring_mfa: 1,
      not_notified: 1,
      upcoming_removals: [upcoming],
      upcoming_removals_total: 1,
    });
    expect(html).toContain("Check the mail server: these members were not warned");
    expect(html).toContain(`color:#dc2626;font-weight:600;">No</td>`);
    expect(text).toContain("  ! Some members in a grace period were not warned by email: check the mail server.");
    expect(text).toContain(
      `    - soon@example.com from Acme <Inc> [${ORG_ID}] — grace period ends 2026-10-05 18:00:00 UTC — NOT warned by email — ${AUTH_SERVER_URI}/admin/users/${OTHER_UID}`,
    );
  });

  test("notes the removals it does not list", () => {
    const { html, text } = build({}, {
      organizations_requiring_mfa: 1,
      removals: [removal],
      removals_total: 4,
    });
    expect(html).toContain("+3 more removals not listed");
    expect(text).toContain("    (+3 more removals not listed)");
  });
});
