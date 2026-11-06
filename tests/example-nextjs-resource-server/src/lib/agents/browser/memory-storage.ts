// NOT server-only: a stand-in for `localStorage` in the browser modules' unit tests.

import type { WebStorageLike } from "@schemavaults/sandbox-management-sdk/web-storage";

/** A `WebStorageLike` kept in memory: what the unit tests give the browser runtime instead of `localStorage`. */
export class MemoryStorage implements WebStorageLike {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  /** Every key, for tests to check what is (no longer) kept. */
  keys(): string[] {
    return [...this.entries.keys()];
  }
}
