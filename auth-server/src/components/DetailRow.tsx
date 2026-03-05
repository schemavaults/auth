import type { ReactElement } from "react";
import Link from "next/link";

export function DetailRow({ label, value, href }: { label: string; value: string; href?: string }): ReactElement {
  return (
    <div className="flex flex-col gap-1 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      {href ? (
        <Link href={href} className="text-sm font-medium break-all text-primary underline hover:no-underline">
          {value}
        </Link>
      ) : (
        <span className="text-sm font-medium break-all">{value}</span>
      )}
    </div>
  );
}
