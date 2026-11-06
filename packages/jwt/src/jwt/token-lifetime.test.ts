import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import {
  DEFAULT_AUTH_SERVER_APP_ID,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { accessTokenExpiry, type UserData } from "@schemavaults/auth-common";
import { type GenerateJWTOptions, generateJWT } from "./generate";
import { decodeJWT } from "./decode";
import getRefreshTokenAudience from "./get_refresh_token_audience";
import { generateNewJwtKeySet, type JWT_Keys } from "./jwt_keys";
import { resolveGeneratedTokenExpiry } from "./token-lifetime";
import MockUser from "@/tests/MockUser";

const env = "test" as const satisfies SchemaVaultsAppEnvironment;
const auth_server_url: string = getAuthServerUrl(env);

async function apiServerKeys(api_server_id: string): Promise<JWT_Keys> {
  return await generateNewJwtKeySet({ audience_id: api_server_id, environment: env });
}

function accessOptions(
  jwt_keys: JWT_Keys,
  audience: string,
  user: UserData,
  iat: number,
): GenerateJWTOptions<"access"> {
  return {
    type: "access",
    user,
    audience,
    iat,
    client_app_id: crypto.randomUUID(),
    auth_server_url,
    jwt_keys,
    env,
  };
}

afterEach(() => {
  setSystemTime(); // back to the real clock
});

describe("resolveGeneratedTokenExpiry()", () => {
  const iat = 1_700_000_000_500; // mid-second, unix ms

  it("keeps the default lifetime when no expires_at is given", () => {
    expect(resolveGeneratedTokenExpiry("access", iat, undefined)).toBeUndefined();
    expect(resolveGeneratedTokenExpiry("refresh", iat, undefined)).toBeUndefined();
  });

  it("floors expires_at to whole seconds", () => {
    expect(resolveGeneratedTokenExpiry("access", iat, iat + 600_999)).toEqual({
      exp_seconds: 1_700_000_601,
      expires_at: 1_700_000_601_000,
    });
  });

  it("caps expires_at at the default access-token lifetime", () => {
    const capped = resolveGeneratedTokenExpiry("access", iat, iat + 10 * accessTokenExpiry * 1000);
    expect(capped?.exp_seconds).toBe(Math.floor(iat / 1000) + accessTokenExpiry);
  });

  it("refuses refresh tokens", () => {
    expect(() => resolveGeneratedTokenExpiry("refresh", iat, iat + 60_000)).toThrow(
      "Only access tokens",
    );
  });

  it("refuses an expiry that is not at least one second after issuance", () => {
    expect(() => resolveGeneratedTokenExpiry("access", iat, iat)).toThrow(TypeError);
    expect(() => resolveGeneratedTokenExpiry("access", iat, iat + 400)).toThrow(TypeError);
    expect(() => resolveGeneratedTokenExpiry("access", iat, iat - 60_000)).toThrow(TypeError);
  });

  it("refuses a non-finite expiry", () => {
    expect(() => resolveGeneratedTokenExpiry("access", iat, Number.NaN)).toThrow(TypeError);
    expect(() =>
      resolveGeneratedTokenExpiry("access", iat, Number.POSITIVE_INFINITY),
    ).toThrow(TypeError);
  });
});

describe("generateJWT({ expires_at })", () => {
  it("mints an access token whose exp is expires_at, and decodeJWT reports it", async () => {
    const api_server_id = crypto.randomUUID();
    const jwt_keys = await apiServerKeys(api_server_id);
    const iat = Date.now();
    const expires_at = iat + 5 * 60 * 1000;

    const token = await generateJWT({
      ...accessOptions(jwt_keys, api_server_id, new MockUser(), iat),
      expires_at,
    });
    expect(token.exp).toBe(Math.floor(expires_at / 1000) * 1000);

    const decoded = await decodeJWT({
      jwt: token.token,
      type: "access",
      audience: api_server_id,
      jwt_keys,
      env,
    });
    expect(decoded.exp).toBe(Math.floor(expires_at / 1000));
  });

  it("reports the default exp of a token minted without expires_at", async () => {
    const api_server_id = crypto.randomUUID();
    const jwt_keys = await apiServerKeys(api_server_id);
    const iat = Date.now();

    const token = await generateJWT(accessOptions(jwt_keys, api_server_id, new MockUser(), iat));
    const decoded = await decodeJWT({
      jwt: token.token,
      type: "access",
      audience: api_server_id,
      jwt_keys,
      env,
    });
    // jose sets a relative exp from the signing clock, which can tick
    // into the next second after `iat`.
    expect(decoded.exp).toBeGreaterThanOrEqual(decoded.iat + accessTokenExpiry);
    expect(decoded.exp).toBeLessThanOrEqual(decoded.iat + accessTokenExpiry + 1);
  });

  it("is refused by every decoder once the early exp has passed", async () => {
    const api_server_id = crypto.randomUUID();
    const jwt_keys = await apiServerKeys(api_server_id);
    const iat = Date.now();

    const token = await generateJWT({
      ...accessOptions(jwt_keys, api_server_id, new MockUser(), iat),
      expires_at: iat + 60_000,
    });

    // Well within the default lifetime, but past the early expiry.
    setSystemTime(new Date(iat + 2 * 60_000));
    await expect(
      decodeJWT({ jwt: token.token, type: "access", audience: api_server_id, jwt_keys, env }),
    ).rejects.toThrow();
  });

  it("refuses expires_at on refresh tokens", async () => {
    const jwt_keys = await generateNewJwtKeySet({
      audience_id: DEFAULT_AUTH_SERVER_APP_ID,
      environment: env,
    });
    const iat = Date.now();

    await expect(
      generateJWT({
        type: "refresh",
        user: new MockUser(),
        audience: getRefreshTokenAudience(env),
        iat,
        client_app_id: crypto.randomUUID(),
        auth_server_url,
        jwt_keys,
        env,
        expires_at: iat + 60_000,
      }),
    ).rejects.toThrow("Only access tokens");
  });
});
