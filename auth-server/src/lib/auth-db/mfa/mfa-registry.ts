import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { hasVerifiedFactor as hasVerifiedFactorFn } from "./has-verified-factor";
import {
  getVerifiedFactorById as getVerifiedFactorByIdFn,
  type VerifiedFactor,
} from "./get-verified-factor-by-id";
import {
  listVerifiedFactorsForUser as listVerifiedFactorsForUserFn,
  type VerifiedFactorSummary,
} from "./list-verified-factors-for-user";
import { listVerifiedFactorTypesForUser as listVerifiedFactorTypesForUserFn } from "./list-verified-factor-types-for-user";
import type { MfaFactorType } from "@schemavaults/auth-common";
import { getFactorById as getFactorByIdFn } from "./get-factor-by-id";
import { createUnverifiedFactor as createUnverifiedFactorFn } from "./create-unverified-factor";
import { verifyFactor as verifyFactorFn } from "./verify-factor";
import { touchFactorLastUsed as touchFactorLastUsedFn } from "./touch-factor-last-used";
import { deleteFactor as deleteFactorFn } from "./delete-factor";
import { deleteAllFactorsForUser as deleteAllFactorsForUserFn } from "./delete-all-factors-for-user";
import { sweepStaleUnverifiedFactors as sweepStaleUnverifiedFactorsFn } from "./sweep-stale-unverified-factors";
import { replaceRecoveryCodes as replaceRecoveryCodesFn } from "./replace-recovery-codes";
import { consumeRecoveryCode as consumeRecoveryCodeFn } from "./consume-recovery-code";
import { countRecoveryCodesRemaining as countRecoveryCodesRemainingFn } from "./count-recovery-codes-remaining";
import type { UserMfaFactorRow } from "./user-mfa-factors-table";

/**
 * Facade for all MFA-related database operations. Mirrors the
 * UserRegistry pattern — methods delegate to standalone functional
 * modules so they remain individually testable.
 */
export class MfaRegistry {
  public constructor(protected readonly db: Kysely<AuthDatabase>) {}

  public hasVerifiedFactor(uid: string): Promise<boolean> {
    return hasVerifiedFactorFn(this.db, uid);
  }

  public getVerifiedFactorById(args: {
    uid: string;
    factor_id: string;
  }): Promise<VerifiedFactor | null> {
    return getVerifiedFactorByIdFn(this.db, args);
  }

  public listVerifiedFactorsForUser(
    uid: string,
  ): Promise<VerifiedFactorSummary[]> {
    return listVerifiedFactorsForUserFn(this.db, uid);
  }

  public listVerifiedFactorTypesForUser(uid: string): Promise<MfaFactorType[]> {
    return listVerifiedFactorTypesForUserFn(this.db, uid);
  }

  public getFactorById(args: {
    uid: string;
    factor_id: string;
  }): Promise<UserMfaFactorRow | null> {
    return getFactorByIdFn(this.db, args);
  }

  public createUnverifiedFactor(args: {
    uid: string;
    secret: string;
  }): Promise<{ factor_id: string }> {
    return createUnverifiedFactorFn(this.db, args);
  }

  public verifyFactor(args: {
    uid: string;
    factor_id: string;
  }): Promise<boolean> {
    return verifyFactorFn(this.db, args);
  }

  public touchFactorLastUsed(factor_id: string): Promise<void> {
    return touchFactorLastUsedFn(this.db, factor_id);
  }

  public deleteFactor(args: {
    uid: string;
    factor_id: string;
  }): Promise<boolean> {
    return deleteFactorFn(this.db, args);
  }

  public deleteAllFactorsForUser(uid: string): Promise<void> {
    return deleteAllFactorsForUserFn(this.db, uid);
  }

  public sweepStaleUnverifiedFactors(uid: string): Promise<void> {
    return sweepStaleUnverifiedFactorsFn(this.db, uid);
  }

  public replaceRecoveryCodes(args: {
    uid: string;
    codes: string[];
  }): Promise<void> {
    return replaceRecoveryCodesFn(this.db, args);
  }

  public consumeRecoveryCode(args: {
    uid: string;
    code: string;
  }): Promise<boolean> {
    return consumeRecoveryCodeFn(this.db, args);
  }

  public countRecoveryCodesRemaining(uid: string): Promise<number> {
    return countRecoveryCodesRemainingFn(this.db, uid);
  }
}
