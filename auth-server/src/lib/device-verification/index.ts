// The user's side of the device authorization grant (RFC 8628): the
// signed-in user enters a user code on the `/device` page, sees what the
// device asks for, and approves or denies it (`/api/auth/device/*`).

export {
  findDeviceAuthorizationForUser,
  type FoundDeviceAuthorization,
  type FindDeviceAuthorizationForUserOptions,
} from "./find-device-authorization-for-user";
export {
  describeDeviceAuthorization,
  type DescribedDeviceAuthorization,
} from "./describe-device-authorization";
export {
  approveDeviceAuthorization,
  type ApproveDeviceAuthorizationResult,
  type ApproveDeviceAuthorizationOptions,
} from "./approve-device-authorization";
