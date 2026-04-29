// CronSecret.ts

import timingSafeEqualSecretString from "@/lib/timingSafeEqualSecretString";

export const cronSecretEnvVarKey = "CRON_SECRET" as const satisfies string;

export function loadCronSecret(): string | undefined {
  return process.env[cronSecretEnvVarKey];
}

export function isCronAuthorizationHeaderValid(
  header: string | null | undefined,
): boolean {
  const cronSecret: string | undefined = loadCronSecret();
  if (typeof cronSecret !== "string" || cronSecret.length === 0) {
    return false;
  }
  const expected: string = `Bearer ${cronSecret}`;
  return timingSafeEqualSecretString(expected, header);
}

export default loadCronSecret;
