import "server-only";
import type { JWKS } from "@schemavaults/jwt";
import reportServerException from "@/lib/reportServerException";
import { AuthServerJwtKeysManager } from "./AuthServerJwtKeysManager";

/**
 * The key manager the route guards verify tokens with. The SDK guards
 * answer a failure to load the verification keys as "no user" (a 401, or a
 * redirect to the login page) and only log it, so a database failure here
 * would look like the user being signed out. It is recorded to the ERRORS
 * table before the guard swallows it: at most every 10 seconds per
 * audience, since one request tries every token it carries.
 */
export class RouteGuardJwtKeysManager extends AuthServerJwtKeysManager {
  public override async loadJwks(audienceId: string): Promise<JWKS> {
    try {
      return await super.loadJwks(audienceId);
    } catch (e: unknown) {
      await reportServerException(e, {
        op_name: `RouteGuardJwtKeysManager.loadJwks:${audienceId}`,
        context: { audience_id: audienceId },
        throttle_ms: 10_000,
      });
      throw e;
    }
  }
}

export default RouteGuardJwtKeysManager;
