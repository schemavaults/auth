"use client";

import { create } from "zustand";
import {
  persist,
  createJSONStorage,
  type StateStorage,
} from "zustand/middleware";
import type { MfaChallengeFactorsPayload } from "@schemavaults/auth-common";

interface MfaChallengeFactorsState {
  // Keyed by challenge_id so a stale entry from a prior login can't bleed
  // into a new challenge. In practice only one challenge is ever in flight.
  byChallengeId: Record<string, MfaChallengeFactorsPayload>;
  // Whether persist has finished reading sessionStorage on this page. We
  // gate the UI on this so the server render and the first client render
  // agree (both "not hydrated"), avoiding a hydration mismatch — the store
  // is created with `skipHydration` and rehydrated from a client effect.
  hasHydrated: boolean;
  setFactors: (
    challenge_id: string,
    payload: MfaChallengeFactorsPayload,
  ) => void;
  clearFactors: (challenge_id: string) => void;
}

// SSR fallback: `sessionStorage` is undefined on the server. persist only
// touches storage on write/rehydrate (both client-only here), but guard
// anyway so the store module is safe to import server-side.
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useMfaChallengeFactorsStore = create<MfaChallengeFactorsState>()(
  persist(
    (set) => ({
      byChallengeId: {},
      hasHydrated: false,
      setFactors: (challenge_id, payload) =>
        set((state) => ({
          byChallengeId: { ...state.byChallengeId, [challenge_id]: payload },
        })),
      clearFactors: (challenge_id) =>
        set((state) => {
          const next = { ...state.byChallengeId };
          delete next[challenge_id];
          return { byChallengeId: next };
        }),
    }),
    {
      name: "mfa-challenge-factors",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.sessionStorage : noopStorage,
      ),
      // Only the factor map is durable; `hasHydrated` is per-page runtime
      // state and must never be read back from storage.
      partialize: (state) => ({ byChallengeId: state.byChallengeId }),
      // Defer reading sessionStorage to a client effect (see the page that
      // calls `.persist.rehydrate()`), so SSR output is deterministic.
      skipHydration: true,
      onRehydrateStorage: () => () => {
        useMfaChallengeFactorsStore.setState({ hasHydrated: true });
      },
    },
  ),
);
