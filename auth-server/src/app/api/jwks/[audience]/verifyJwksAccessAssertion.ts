import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { JwksAccessKeysRegistry } from "@/lib/auth-db/jwks-access-keys";
import { RedisCache } from "@/lib/redis";
import { getAuthServerUrl } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import {
  jwtVerify,
  importSPKI,
  JWKS_ACCESS_PROOF_TOKEN_MAX_AGE,
  JWKS_ACCESS_PROOF_TOKEN_REQUIRED_CLAIMS,
} from "@schemavaults/jwt";

// Accepted jtis are remembered for twice the 60s acceptance window
// (maxTokenAge) so an assertion can never be replayed: by the time its jti
// record expires, the assertion itself is too old to verify.
const SEEN_JTI_TTL_SECONDS = 120;

export default async function verifyJwksAccessAssertion(
  assertion: string,
  audience: string,
  db: Kysely<AuthDatabase>
): Promise<boolean> {
  const accessKeysRegistry = new JwksAccessKeysRegistry(db);
  const activeKey = await accessKeysRegistry.getActiveKeyForAudience(audience);

  if (!activeKey) {
    console.warn(`No active JWKS access key found for audience "${audience}"`);
    return false;
  }

  try {
    const publicKey = await importSPKI(activeKey.public_key, "RS256");
    const { payload } = await jwtVerify(assertion, publicKey, {
      algorithms: ["RS256"],
      // createJwksAccessProofToken mints assertions with the (white-labellable)
      // auth server URL as the `aud` claim, not the auth app id.
      audience: getAuthServerUrl(),
      issuer: audience,
      maxTokenAge: JWKS_ACCESS_PROOF_TOKEN_MAX_AGE,
      requiredClaims: [...JWKS_ACCESS_PROOF_TOKEN_REQUIRED_CLAIMS],
    });

    // Verify the assertion is for this specific audience
    if (payload.sub !== audience) {
      console.warn(`Assertion subject "${payload.sub}" does not match audience "${audience}"`);
      return false;
    }

    // jose only checks that required claims are present, so pin down the
    // jti's shape before using it as a Redis key component.
    const jti = payload.jti;
    if (typeof jti !== "string" || jti.length === 0 || jti.length > 255) {
      console.warn(`Assertion for audience "${audience}" carries an invalid jti claim`);
      return false;
    }

    // Each assertion is single-use: SET NX fails if this jti was already
    // accepted, which rejects replays of captured assertions.
    await using redis = RedisCache.createConnection();
    const claimed = await redis.client.set(
      `jwks-access-assertion:seen-jti:${audience}:${jti}`,
      "1",
      "EX",
      SEEN_JTI_TTL_SECONDS,
      "NX",
    );
    if (claimed !== "OK") {
      console.warn(`Replayed JWKS access assertion (jti "${jti}") for audience "${audience}"`);
      return false;
    }

    return true;
  } catch (e: unknown) {
    console.error("Failed to verify JWKS access assertion:", e);
    return false;
  }
}
