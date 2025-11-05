export const authClientEventTypes = [
  "authStateChanged",
] as const satisfies readonly string[];

export type AuthClientEvent = (typeof authClientEventTypes)[number];

export type OnAuthStateChangedListener = () => void;

export interface OnAuthStateChangedListenerRef {
  listener: OnAuthStateChangedListener;
  id: string;
}
