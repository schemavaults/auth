export default function isBrowser(): boolean {
  let isWindowGlobalVariableSet: boolean = false;
  try {
    // @ts-expect-error We're checking if the 'window' global is defined when DOM library is not explicitly loaded
    if (window) {
      isWindowGlobalVariableSet = true;
    }
  } catch (e: unknown) {
    void e; // no-op-- it's okay for this to not be a browser
    isWindowGlobalVariableSet = false;
  }
  return isWindowGlobalVariableSet;
}
