import type { ReactElement } from "react";
import printDateTime from "@/lib/printDateTime";

export interface LocalDateTimeProps {
  value: Date | string | number | null | undefined;
  showSeconds?: boolean;
  fallback?: string;
  className?: string;
}

// Renders a timestamp formatted in the local timezone. The wrapping <span> carries
// suppressHydrationWarning because printDateTime reads timezone-local fields
// (getHours, getDate, ...) which produce a different string on the server (server TZ)
// vs. during hydration (user's browser TZ). The mismatch is expected; client wins.
export function LocalDateTime({
  value,
  showSeconds = true,
  fallback = "-",
  className,
}: LocalDateTimeProps): ReactElement {
  if (value === null || value === undefined) {
    return <span className={className}>{fallback}</span>;
  }
  const asDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return <span className={className}>{fallback}</span>;
  }
  return (
    <span className={className} suppressHydrationWarning>
      {printDateTime(asDate, showSeconds)}
    </span>
  );
}

export default LocalDateTime;
