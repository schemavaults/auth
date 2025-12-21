export default function isClientRuntime(): boolean {
  try {
    if (!window) {
      return false;
    }
    return true;
  } catch (error: unknown) {
    void error;
    return false;
  }
}
