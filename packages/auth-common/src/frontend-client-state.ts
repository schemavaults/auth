import type { RefreshToken } from "./token-data";
// import type { UserData } from "./user_data";

// The shape of the auth state on the client
export interface AuthClientState {
  // user: UserData;
  refreshToken: RefreshToken;
}
