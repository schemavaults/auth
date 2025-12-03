export function isPrivateBeta(): boolean {
  try {
    const PRIVATE_BETA_FLAG: string | undefined = process.env.NEXT_PUBLIC_SCHEMAVAULTS_PRIVATE_BETA;
    if (
      !!PRIVATE_BETA_FLAG &&
      typeof PRIVATE_BETA_FLAG === "string" &&
      PRIVATE_BETA_FLAG.includes("true")
    ) {
      return true;
    }

    const SECOND_PRIVATE_BETA_FLAG = process.env.SCHEMAVAULTS_PRIVATE_BETA;
    if (
      !!SECOND_PRIVATE_BETA_FLAG &&
      typeof SECOND_PRIVATE_BETA_FLAG === "string" &&
      SECOND_PRIVATE_BETA_FLAG.includes("true")
    ) {
      return true;
    }
  } catch (e: unknown) {
    console.error("Error checking private beta flag from environment variables:", e);
    throw new Error("Error checking private beta flag from environment variables!");
  }

  return false;
}

export { isPrivateBeta as isPrivateBetaEnabled };

export default isPrivateBeta;
