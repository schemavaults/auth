// The width hook behind the `@schemavaults/ui` charts' `width="auto"`,
// re-exported so existing `@schemavaults/auth-ui` imports keep working
// (auth-ui 0.17.0 shipped its own copy).
export { useMeasuredWidth, useMeasuredWidth as default } from "@schemavaults/ui";
export type { UseMeasuredWidthResult } from "@schemavaults/ui";
