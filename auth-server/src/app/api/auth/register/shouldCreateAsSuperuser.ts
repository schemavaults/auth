import timingSafeEqualSecretString from "@/lib/timingSafeEqualSecretString";
import loadSuperuserInviteCode from "@/lib/SuperuserInviteCode";

export default function shouldCreateAsSuperuser(invite_code: string): boolean {
  if (typeof invite_code !== 'string') {
    throw new TypeError("Expected 'invite_code' to be a string!");
  }

  let superuserInviteCode: string | undefined | null = null;
  try {
    const SUPERUSER_CODE: string | undefined = loadSuperuserInviteCode();
    if (typeof SUPERUSER_CODE === "string" && SUPERUSER_CODE.length > 0) {
      superuserInviteCode = SUPERUSER_CODE;
    }
  } catch (e: unknown) {
    void e;
  }

  if (
    !superuserInviteCode ||
    typeof superuserInviteCode !== "string" ||
    superuserInviteCode.length === 0
  ) {
    return false;
  }

  return timingSafeEqualSecretString(superuserInviteCode, invite_code);
}
