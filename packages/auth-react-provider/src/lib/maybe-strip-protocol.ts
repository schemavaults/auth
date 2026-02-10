/**
 * @param url A URL that may start with a protocol (e.g. https://schemavaults.com)
 * @returns The input argument stripped of its protocol (e.g. schemavaults.com)
 */
export default function maybeStripProtocol(url: string): string {
  if (url.startsWith("https://")) {
    return url.slice("https://".length);
  } else if (url.startsWith("http://")) {
    return url.slice("http://".length);
  } else {
    return url;
  }
}
