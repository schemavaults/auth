/**
 * Thrown when a service account is requested for a client application that
 * may not have one: a dynamically registered (RFC 7591, ownerless) client.
 * Anyone can register such a client anonymously, so it never gets a
 * machine identity of its own (see app-service-accounts.ts).
 */
export class ServiceAccountUnavailableError extends Error {
  public readonly app_id: string;

  public constructor(app_id: string) {
    super(
      `Client app '${app_id}' was registered dynamically and cannot have a service account`,
    );
    this.name = "ServiceAccountUnavailableError";
    this.app_id = app_id;
  }
}

export default ServiceAccountUnavailableError;
