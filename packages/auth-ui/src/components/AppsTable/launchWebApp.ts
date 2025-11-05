import type {
  SchemaVaultsAppDomainRef,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { useToast } from "@schemavaults/ui";

export interface LaunchWebAppOptions {
  appDomains: readonly SchemaVaultsAppDomainRef[];
  launchableAppDomains: readonly SchemaVaultsAppDomainRef[];
  toast: ReturnType<typeof useToast>["toast"];
  environment: SchemaVaultsAppEnvironment;
}

export function launchWebApp({
  appDomains,
  launchableAppDomains,
  toast,
  environment,
}: LaunchWebAppOptions): void {
  if (!Array.isArray(appDomains) || appDomains.length === 0) {
    toast({
      title: "No domains found for this app",
      variant: "destructive",
    });
    return;
  }

  if (!launchableAppDomains || launchableAppDomains.length === 0) {
    toast({
      title: `No ${environment === "development" || environment === "test" ? "dev" : "production"} domains found for this app`,
      variant: "destructive",
    });
    return;
  }
  console.assert(
    launchableAppDomains.length >= 1,
    "Expected an app domain (that meets the criteria) to have been found to launch!",
  );

  let appDomainToLaunch: string | undefined = undefined;

  const first: SchemaVaultsAppDomainRef = launchableAppDomains[0]!;

  if (environment === "production" && first.environment !== "production") {
    throw new Error(
      "Cannot launch a non-production URL from production auth server",
    );
  }

  const redirectDomain: string = first.domain;

  if (
    !redirectDomain.startsWith("http://") &&
    !redirectDomain.startsWith("https://")
  ) {
    throw new Error("Invalid redirect domain loaded for app launch");
  }

  if (environment === "development" || environment === "test") {
    appDomainToLaunch = `${redirectDomain}/auth/login`;
  } else {
    appDomainToLaunch = `${redirectDomain}/auth/login`;
  }

  if (typeof appDomainToLaunch === "string") {
    if (
      !appDomainToLaunch.startsWith("https://") &&
      (environment === "production" || environment === "staging")
    ) {
      throw new Error("Cannot launch non-HTTPS URL in production environment");
    } else {
      window.location.href = appDomainToLaunch;
    }
  } else {
    throw new Error("Failed to determine URL to launch app at");
  }

  return;
}
