// SuperuserInviteCode.ts

export const superuserInviteCodeEnvVarKey =
  "PRIVATE_SUPERUSER_INVITE_CODE" as const satisfies string;

export function loadSuperuserInviteCode(): string | undefined {
  const inviteCode: string | undefined =
    process.env[superuserInviteCodeEnvVarKey];
  return inviteCode;
}

export default loadSuperuserInviteCode;
