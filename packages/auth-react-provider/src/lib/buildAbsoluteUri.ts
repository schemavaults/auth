import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export default function buildAbsoluteUri(
  maybeRelativeUri: string,
  environment: SchemaVaultsAppEnvironment,
): string {
  if (typeof maybeRelativeUri !== "string") {
    throw new TypeError(
      "Expected a string containing either a relative or absolute URL",
    );
  }
  const origin: string = window.location.origin;
  if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
    throw new Error("Expected window.location.origin to use HTTP or HTTPS!");
  }

  if (environment === "production" || environment === "staging") {
    if (!origin.startsWith("https://")) {
      throw new Error(
        "Expected HTTPS to be used in production or staging environments!",
        {
          cause: `Bad origin: '${origin}'`,
        },
      );
    }
  }

  if (maybeRelativeUri.length === 0 || maybeRelativeUri === "/") {
    return origin;
  }

  if (
    maybeRelativeUri.startsWith("http://") ||
    maybeRelativeUri.startsWith("https://")
  ) {
    // We already have an absolute URI
    const alreadyAbsoluteUri = maybeRelativeUri;

    if (environment === "production" || environment === "staging") {
      if (!alreadyAbsoluteUri.startsWith("https://")) {
        throw new Error(
          "Expected HTTPS to be used in production or staging environments!",
          {
            cause: `Bad absolute URI: '${alreadyAbsoluteUri}'`,
          },
        );
      }
    }
    return alreadyAbsoluteUri;
  }

  if (!maybeRelativeUri.startsWith("/")) {
    throw new TypeError("Expected relative URI to start with a '/'");
  }

  return `${origin}${maybeRelativeUri}`;
}
