import type { Insertable, Selectable } from "@schemavaults/dbh";

/**
 * Tombstones for deleted users. A row here permanently reserves the uid:
 * third-party resource servers may still hold data keyed by it, so it
 * must never be assigned to a new user (enforced by the
 * `users_prevent_deleted_uid_reuse` trigger from migration 00032 and
 * pre-checked in `createUser`). Only the uid and deletion timestamp are
 * kept — no email or other PII survives the deletion.
 */
export type DeletedUserUidsTable = {
  uid: string;
  deleted_at: number;
};

export type DeletedUserUidRow = Selectable<DeletedUserUidsTable>;
export type NewDeletedUserUidRow = Insertable<DeletedUserUidsTable>;
