"use client";

import { useState, useTransition, type FC, type ReactElement } from "react";
import type {
  ApiServerDomainVerification,
  ApiServerDomainVerificationMethod,
  SchemaVaultsApiServerDomainRef,
} from "@schemavaults/app-definitions";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useToast,
} from "@schemavaults/ui";
import { useAuth } from "@schemavaults/auth-react-provider";
import { Copy, ShieldCheck } from "lucide-react";

export interface VerifyApiServerDomainDialogProps {
  domain: SchemaVaultsApiServerDomainRef;
  verification: ApiServerDomainVerification;
  /** Platform administrators may also attest the domain without DNS. */
  canAttest: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the domain is verified. */
  onVerified?: (verification: ApiServerDomainVerification) => void;
}

function CopyableValue({ label, value, testId }: { label: string; value: string; testId: string }): ReactElement {
  const { toast } = useToast();
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      toast({ variant: "default", title: `${label} copied to clipboard` });
    } catch {
      toast({ variant: "destructive", title: `Failed to copy the ${label.toLowerCase()}` });
    }
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2">
        <code className="min-w-0 flex-1 break-all text-xs" data-testid={testId}>
          {value}
        </code>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={`Copy ${label.toLowerCase()}`} onClick={copy}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Explains how to prove control of a registered domain and asks the auth
 * server to check it: the DNS TXT record to publish (and keep published),
 * a "Check DNS" button, and, for platform administrators, an attestation
 * for hosts DNS cannot verify.
 */
export const VerifyApiServerDomainDialog: FC<VerifyApiServerDomainDialogProps> = ({
  domain,
  verification,
  canAttest,
  open,
  onOpenChange,
  onVerified,
}): ReactElement => {
  const auth = useAuth();
  const { toast } = useToast();
  const [busy, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const record = verification.dns_txt_record;

  function verify(method: ApiServerDomainVerificationMethod): void {
    setProblem(null);
    startTransition(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        const attempt = await authClient.verifyApiServerDomain(
          domain.api_server_id,
          domain.api_server_domain_ref_id,
          method,
        );
        if (attempt.verified) {
          toast({ variant: "default", title: "Domain verified" });
          onOpenChange(false);
          onVerified?.(attempt.verification);
          return;
        }
        setProblem(attempt.message);
      } catch (e: unknown) {
        setProblem(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]" id="verify-api-server-domain-dialog-content">
        <DialogHeader>
          <DialogTitle>Verify domain ownership</DialogTitle>
          <DialogDescription>
            Resource URLs on <span className="font-medium break-all">{domain.domain}</span> (
            {domain.environment}) resolve to this API server only once you prove you control
            the domain, so nobody else can claim it.
          </DialogDescription>
        </DialogHeader>

        {record ? (
          <div className="space-y-3 text-sm">
            <p>
              Add this TXT record to the domain&apos;s DNS, then check it. Keep the record
              published: the domain returns to unverified if it is removed.
            </p>
            <CopyableValue label="Record name" value={record.name} testId="api-server-domain-txt-record-name" />
            <CopyableValue label="Record value" value={record.value} testId="api-server-domain-txt-record-value" />
          </div>
        ) : (
          <p className="text-sm" data-testid="api-server-domain-not-dns-verifiable">
            This host cannot be verified through DNS (loopback and IP-literal hosts,
            single-label names). Only a platform administrator can verify it.
          </p>
        )}

        {problem && (
          <p className="text-sm text-destructive" role="alert" data-testid="verify-api-server-domain-problem">
            {problem}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Close
          </Button>
          {canAttest && (
            <Button
              type="button"
              variant="outline"
              id="attest-api-server-domain-button"
              onClick={() => verify("administrator")}
              disabled={busy}
              title="Verify the domain without DNS, as a platform administrator"
            >
              Verify as administrator
            </Button>
          )}
          {record && (
            <Button type="button" id="check-api-server-domain-dns-button" onClick={() => verify("dns_txt")} disabled={busy}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              Check DNS
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VerifyApiServerDomainDialog;
