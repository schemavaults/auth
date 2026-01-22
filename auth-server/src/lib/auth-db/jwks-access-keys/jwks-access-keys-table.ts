import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";

export interface JwksAccessKeysTable {
  key_id: string;
  api_server_id: string;
  public_key: string;
  key_algorithm: string;
  created_at: number | string;
  is_active: boolean;
}

export type JwksAccessKeyRecord = Selectable<JwksAccessKeysTable>;
export type NewJwksAccessKeyRecord = Insertable<JwksAccessKeysTable>;
export type JwksAccessKeyRecordUpdate = Updateable<JwksAccessKeysTable>;

export interface JwksAccessKeysForHardcodedTable {
  key_id: string;
  api_server_id: string;
  public_key: string;
  key_algorithm: string;
  created_at: number | string;
  is_active: boolean;
}

export type JwksAccessKeyForHardcodedRecord = Selectable<JwksAccessKeysForHardcodedTable>;
export type NewJwksAccessKeyForHardcodedRecord = Insertable<JwksAccessKeysForHardcodedTable>;
export type JwksAccessKeyForHardcodedRecordUpdate = Updateable<JwksAccessKeysForHardcodedTable>;
