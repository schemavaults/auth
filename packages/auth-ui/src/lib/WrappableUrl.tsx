import { Fragment, type ReactElement } from "react";
import { cn } from "@schemavaults/ui";
import { splitUrlAtLineBreaks } from "@/lib/url-line-breaks";

export interface WrappableUrlProps {
  url: string;
  className?: string;
}

/**
 * Renders a URL that wraps at its natural boundaries (after `://`, before
 * `/`, `.`, `-`, `?`, ...) instead of between any two characters, so a
 * narrow column shows `https://app` / `.example.com` / `/auth/callback`
 * rather than one character per line. A piece that is wider than its
 * container on its own still wraps inside it (`overflow-wrap: break-word`),
 * but the longest piece sets how narrow an auto-sized container (a table
 * column, a flex item without `min-w-0`) may get. Copying the text copies
 * the URL unchanged.
 */
export function WrappableUrl({ url, className }: WrappableUrlProps): ReactElement {
  const pieces: string[] = splitUrlAtLineBreaks(url);
  return (
    <span className={cn("break-words", className)}>
      {pieces.map((piece, index) => (
        // The pieces of a URL never reorder, so their position is their identity.
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {piece}
        </Fragment>
      ))}
    </span>
  );
}

export default WrappableUrl;
