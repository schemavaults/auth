export default function assertValidRouteGuardType(
  route_guard_type: "authenticated" | "admin",
): void {
  if (route_guard_type !== "authenticated" && route_guard_type !== "admin") {
    throw new TypeError(
      "Expected 'route_guard_type' to be either 'authenticated' or 'admin!'",
    );
  }
}
