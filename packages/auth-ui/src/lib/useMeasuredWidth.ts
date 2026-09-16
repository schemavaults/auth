"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export interface UseMeasuredWidthResult<T extends HTMLElement> {
  /** Attach to the element whose width the chart should match. */
  ref: RefObject<T | null>;
  /** The measured width in whole pixels, or `fallback_width` before measuring. */
  width: number;
}

/**
 * @description Tracks an element's rendered width. The chart primitives in
 * `@schemavaults/ui` size their SVG canvas in pixels, so a chart that should
 * span its card has to be told how wide the card currently is.
 *
 * The fallback width is used for the server render and the first client
 * render — the observer only reports after mount — so the two agree and
 * hydration stays clean.
 */
export function useMeasuredWidth<T extends HTMLElement>(
  fallback_width: number,
): UseMeasuredWidthResult<T> {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState<number>(fallback_width);

  useEffect((): (() => void) | undefined => {
    const element: T | null = ref.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      const entry: ResizeObserverEntry | undefined = entries[0];
      if (!entry) {
        return;
      }
      const measured: number = Math.round(entry.contentRect.width);
      if (measured > 0) {
        setWidth(measured);
      }
    });
    observer.observe(element);

    return (): void => {
      observer.disconnect();
    };
  }, []);

  return { ref, width };
}

export default useMeasuredWidth;
