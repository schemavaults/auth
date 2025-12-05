import type { UserData } from "@schemavaults/auth-common";

export class MockUser implements UserData {
  public uid: string;
  public email: string;
  public email_verified: boolean;
  public created_at: number;
  public admin: boolean;
  public disabled: boolean;

  constructor() {
    this.uid = crypto.randomUUID();
    this.email = "test123@gmail.com";
    this.email_verified = true;
    this.created_at = Date.now();
    this.admin = false;
    this.disabled = false;
  }

  public get sub(): string {
    return this.uid;
  }
}

export default MockUser;
