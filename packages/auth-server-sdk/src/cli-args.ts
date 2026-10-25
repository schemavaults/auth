/** Reads `<flag> <value>`; `present` with no `value` when the value is missing. */
export function readStringFlag(
  args: readonly string[],
  flag: string,
): { present: boolean; value: string | undefined } {
  const index = args.indexOf(flag);
  if (index === -1) {
    return { present: false, value: undefined };
  }
  const value = args[index + 1];
  return {
    present: true,
    value: value !== undefined && !value.startsWith("-") ? value : undefined,
  };
}

/**
 * The first positional argument (the command), skipping the values of the
 * flags that take one.
 */
export function findCommand(
  args: readonly string[],
  flagsWithValues: readonly string[],
): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] as string;
    if (flagsWithValues.includes(arg)) {
      index++;
      continue;
    }
    if (!arg.startsWith("-")) {
      return arg;
    }
  }
  return undefined;
}
