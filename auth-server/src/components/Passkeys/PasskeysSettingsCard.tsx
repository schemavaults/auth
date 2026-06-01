"use client";

import { type FC, type ReactElement } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@schemavaults/ui";
import { KeyRound } from "lucide-react";
import { PasskeysSettingsSection } from "./PasskeysSettingsSection";

export interface PasskeysSettingsCardProps {
  className?: string;
}

// Standalone card wrapping the passkey (WebAuthn) management UI. All WebAuthn
// browser ceremonies stay in the auth server (inside PasskeysSettingsSection),
// not in the shared @schemavaults/auth-ui package.
export const PasskeysSettingsCard: FC<PasskeysSettingsCardProps> = ({
  className,
}): ReactElement => {
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          Passkeys
        </CardTitle>
        <CardDescription>
          Sign in with device biometrics or a security key instead of an
          authenticator code.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PasskeysSettingsSection />
      </CardContent>
    </Card>
  );
};

export default PasskeysSettingsCard;
