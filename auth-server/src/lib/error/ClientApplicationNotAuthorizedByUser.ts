export class ClientApplicationNotAuthorizedByUser extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export default ClientApplicationNotAuthorizedByUser;
