import { DEFAULT_AUTH_SERVER_APP_ID } from "@schemavaults/app-definitions";
import { formatOidcSubClaim, type UserData } from "@schemavaults/auth-common";

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

  // UserData.sub is the OIDC subject `<auth_server_app_id>|<uid>`.
  public get sub(): string {
    return formatOidcSubClaim(DEFAULT_AUTH_SERVER_APP_ID, this.uid);
  }
}

export default MockUser;
