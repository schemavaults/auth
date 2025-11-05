import type { NavigationPath } from "./parse-navigation-path";

export function comparePath(path: NavigationPath, route: NavigationPath): boolean {
  if (!Array.isArray(path) || !Array.isArray(route)) {
    throw new Error("comparePath: path and route must be arrays of route segments.");
  }
  if (path.length === 0 && route.length === 0) {
    return true;
  }
  if (route.length === 0 && path.length > 0) {
    return false;
  }
  return route.every((segment, i) => segment === path[i]);
};
