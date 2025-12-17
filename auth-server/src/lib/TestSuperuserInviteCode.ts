export const superuserInviteCodeEnvVarKey: string =
  "PRIVATE_SUPERUSER_INVITE_CODE" as const;

export default function loadSuperuserInviteCode(): string | undefined {
  const inviteCode: string | undefined =
    process.env[superuserInviteCodeEnvVarKey];
  return inviteCode;
}
