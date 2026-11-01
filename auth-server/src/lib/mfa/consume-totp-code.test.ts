import { describe, test, expect } from "bun:test";
import type { MfaRegistry } from "@/lib/auth-db/mfa";
import { verifyAndConsumeTotpCode } from "./consume-totp-code";
import {
  generateTotpCodeForTesting,
  generateTotpSecret,
  totpTimeStepAt,
  TOTP_STEP_SECONDS,
} from "./totp";

const UID = "11111111-1111-4111-8111-111111111111";
const FACTOR_ID = "22222222-2222-4222-8222-222222222222";
const STEP_MS = TOTP_STEP_SECONDS * 1000;

// In-memory stand-in for MfaRegistry.consumeTotpTimeStep with the same
// compare-and-set rule as its SQL (consume-totp-time-step.ts): record the
// step only if it is later than the stored one.
function fakeRegistry(initial: number | null = null): {
  registry: MfaRegistry;
  lastStep: () => number | null;
  calls: Array<{ uid: string; factor_id: string; time_step: number }>;
} {
  let last: number | null = initial;
  const calls: Array<{ uid: string; factor_id: string; time_step: number }> = [];
  const registry = {
    async consumeTotpTimeStep(args: {
      uid: string;
      factor_id: string;
      time_step: number;
    }): Promise<boolean> {
      calls.push(args);
      if (last !== null && args.time_step <= last) return false;
      last = args.time_step;
      return true;
    },
  } as unknown as MfaRegistry;
  return { registry, lastStep: () => last, calls };
}

describe("verifyAndConsumeTotpCode", () => {
  test("accepts a current code once and records its time step", async () => {
    const secret = generateTotpSecret();
    const code = generateTotpCodeForTesting(secret);
    const { registry, lastStep, calls } = fakeRegistry();
    const args = { mfaRegistry: registry, uid: UID, factor_id: FACTOR_ID, secret, code };

    expect(await verifyAndConsumeTotpCode(args)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.uid).toBe(UID);
    expect(calls[0]?.factor_id).toBe(FACTOR_ID);
    expect(Math.abs((lastStep() as number) - totpTimeStepAt(Date.now()))).toBeLessThanOrEqual(1);

    // The same code again is a replay.
    expect(await verifyAndConsumeTotpCode(args)).toBe(false);
  });

  test("refuses a code from a step at or before the last accepted one", async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const step = totpTimeStepAt(now);
    // The factor already accepted the next step's code (a fast clock):
    // the current and the previous step's codes are refused, though both
    // are inside the drift window.
    const { registry } = fakeRegistry(step + 1);
    for (const offset of [0, -1, 1]) {
      const code = generateTotpCodeForTesting(secret, now + offset * STEP_MS);
      expect(
        await verifyAndConsumeTotpCode({
          mfaRegistry: registry,
          uid: UID,
          factor_id: FACTOR_ID,
          secret,
          code,
        }),
      ).toBe(false);
    }
  });

  test("accepts a later step after an earlier one", async () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const { registry, lastStep } = fakeRegistry(totpTimeStepAt(now) - 1);
    const code = generateTotpCodeForTesting(secret, now + STEP_MS);
    expect(
      await verifyAndConsumeTotpCode({
        mfaRegistry: registry,
        uid: UID,
        factor_id: FACTOR_ID,
        secret,
        code,
      }),
    ).toBe(true);
    expect(lastStep()).toBe(totpTimeStepAt(now) + 1);
  });

  test("a wrong code is refused without touching the stored step", async () => {
    const secret = generateTotpSecret();
    const { registry, calls } = fakeRegistry();
    expect(
      await verifyAndConsumeTotpCode({
        mfaRegistry: registry,
        uid: UID,
        factor_id: FACTOR_ID,
        secret,
        code: "abcdef",
      }),
    ).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
