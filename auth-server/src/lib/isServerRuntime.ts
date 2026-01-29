export default function isServer(): boolean {
  let isServer: boolean = false;
  try {
    if (!window) {
      isServer = true;
    }
  } catch (e: unknown) {
    void e;
    isServer = true;
  }
  return isServer;
}
