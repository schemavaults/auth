export type NavigationPath = string[];

function stripSearchParams(path_url: string): string {
  if (!path_url.includes("?")) {
    return path_url;
  }
  return path_url.split("?")[0];
}

export function parseNavigationPath(path_url: string): NavigationPath {
  if (typeof path_url !== "string") {
    throw new Error(
      `parseNavigationPath: path_url must be a string, received type ${typeof path_url}`,
    );
  }
  let url: string = path_url;

  if (url.startsWith("//")) {
    url = url.slice(2);
  } else if (url.startsWith("/")) {
    url = url.slice(1);
  }
  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }
  if (url === "") {
    return [];
  }

  url = stripSearchParams(url);

  return url.split("/");
}

export default parseNavigationPath;
