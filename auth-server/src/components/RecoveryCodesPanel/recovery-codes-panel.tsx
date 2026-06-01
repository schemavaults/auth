"use client";

import { useState, useCallback, type FC, type ReactElement } from "react";
import {
  Button,
  Checkbox,
  cn,
} from "@schemavaults/ui";
import { ClipboardCopy, Download } from "lucide-react";

export interface RecoveryCodesPanelProps {
  codes: readonly string[];
  onAcknowledge?: (acknowledged: boolean) => void;
  className?: string;
}

export const RecoveryCodesPanel: FC<RecoveryCodesPanelProps> = ({
  codes,
  onAcknowledge,
  className,
}): ReactElement => {
  const [acknowledged, setAcknowledged] = useState(false);

  const handleAck = useCallback(
    (next: boolean) => {
      setAcknowledged(next);
      if (onAcknowledge) onAcknowledge(next);
    },
    [onAcknowledge],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
    } catch (e) {
      console.warn("Failed to copy recovery codes", e);
    }
  }, [codes]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([codes.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schemavaults-mfa-recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [codes]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        These recovery codes are shown only once. Save them now — each can
        be used in place of an authenticator code if you lose your device.
      </div>
      <div
        data-testid="mfa-recovery-codes-list"
        className="grid grid-cols-2 gap-2 rounded border bg-muted p-3 font-mono text-sm"
      >
        {codes.map((code, idx) => (
          <div key={`${code}-${idx}`} className="select-all">
            {code}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          type="button"
          onClick={handleCopy}
          className="flex flex-row gap-2 flex-nowrap"
        >
          <ClipboardCopy className="h-4 w-4" />
          Copy all
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={handleDownload}
          className="flex flex-row gap-2 flex-nowrap"
        >
          <Download className="h-4 w-4" />
          Download .txt
        </Button>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          id="mfa-recovery-codes-acknowledge"
          checked={acknowledged}
          onCheckedChange={(v) => handleAck(v === true)}
          data-testid="mfa-recovery-codes-acknowledge"
        />
        <label htmlFor="mfa-recovery-codes-acknowledge">
          I have saved these recovery codes somewhere safe.
        </label>
      </div>
    </div>
  );
};

export default RecoveryCodesPanel;
