
export interface ICreateUserOptions {
  email: string,
  password: string,
  invite_code: string | undefined,
  uid?: string | undefined
}
