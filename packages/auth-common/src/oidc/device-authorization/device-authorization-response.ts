import { z } from "zod";
import { DEVICE_AUTHORIZATION_DEFAULT_INTERVAL_SECONDS } from "./constants";

/**
 * The device authorization response (RFC 8628 §3.2), as the auth server's
 * `POST /api/oidc/device_authorization` answers it:
 *
 * - `device_code`: the client's secret handle on the request; it polls the
 *   token endpoint with it. Never show it to the user.
 * - `user_code`: what the user types on the verification page, formatted
 *   for display ("BCDF-GHJK").
 * - `verification_uri`: the page where the user enters it (the auth
 *   server's `/device`). Show it with the user code.
 * - `verification_uri_complete`: the same page with the code filled in, for
 *   a QR code or a link the user can open directly. Still show the user
 *   code next to it, so the user can check it against what the page shows.
 * - `expires_in`: seconds until both codes expire.
 * - `interval`: seconds to wait between polls (RFC 8628 §3.5; add 5 on
 *   every `slow_down`). Defaults to 5 when omitted.
 *
 * Loose: other fields an authorization server adds are kept.
 */
export const deviceAuthorizationResponseSchema = z.looseObject({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.url(),
  verification_uri_complete: z.url().optional(),
  expires_in: z.number().int().positive(),
  interval: z
    .number()
    .int()
    .positive()
    .optional()
    .default(DEVICE_AUTHORIZATION_DEFAULT_INTERVAL_SECONDS),
});

export type DeviceAuthorizationResponse = z.infer<
  typeof deviceAuthorizationResponseSchema
>;
