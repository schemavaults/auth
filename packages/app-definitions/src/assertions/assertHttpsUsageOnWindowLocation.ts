export default function assertHttpsUsageOnWindowLocation(): void {
  // @ts-expect-error We're checking if the 'window' global is defined when DOM library is not explicitly loaded
  if (!window) {
    throw new Error(
      "assertHttpsUsageOnWindowLocation can only be called in a browser",
    );
  }
  // @ts-expect-error We're checking if the 'window.location' global is defined when DOM library is not explicitly loaded
  else if (!("location" in window) || !window.location) {
    throw new Error(
      "assertHttpsUsageOnWindowLocation can only be called in a browser",
    );
  }
  // @ts-expect-error We're checking if the 'window.location' global is defined when DOM library is not explicitly loaded
  else if (!window.location.protocol) {
    throw new Error(
      "assertHttpsUsageOnWindowLocation can only be called in a browser",
    );
  }
  // @ts-expect-error We're checking if the 'window.location.protocol' is set to https: when DOM library is not explicitly loaded
  if (window.location.protocol !== "https:") {
    throw new Error("Production and staging environments must use HTTPS!");
  }
}
