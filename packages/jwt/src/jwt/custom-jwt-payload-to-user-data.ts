import type { UserData } from "@schemavaults/auth-common";
import type { CustomJWTPayload } from "./payload_data";

export function customJwtPayloadToUserData(
  payload: CustomJWTPayload,
): UserData {
  return {
    uid: payload.uid,
    sub: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified,
    admin: payload.admin,
    disabled: payload.disabled,
    created_at: payload.created_at,
    // Carry the token's granted scopes through so route guards can
    // enforce `required_scopes`. Absent on tokens issued before scopes
    // became first-class (userDataSchema keeps the field optional).
    ...(typeof payload.scope === "string" && payload.scope.length > 0
      ? { scope: payload.scope }
      : {}),
  };
}
