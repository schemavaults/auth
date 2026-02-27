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
  };
}
