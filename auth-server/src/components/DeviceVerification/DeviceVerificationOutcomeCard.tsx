"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@schemavaults/ui";
import { CheckCircle2, MailWarning, XCircle } from "lucide-react";
import { DEVICE_VERIFICATION_CARD_CLASS_NAME } from "./card-class-name";

export type DeviceVerificationOutcome =
  | { kind: "approved"; app_name: string }
  | { kind: "denied"; app_name: string }
  | { kind: "email_verification_required"; message: string };

export interface DeviceVerificationOutcomeCardProps {
  outcome: DeviceVerificationOutcome;
  onEnterAnotherCode: () => void;
}

/** Step 3 of `/device`: the request was approved or denied, or cannot be yet. */
export function DeviceVerificationOutcomeCard({
  outcome,
  onEnterAnotherCode,
}: DeviceVerificationOutcomeCardProps): ReactElement {
  const content = ((): { icon: ReactElement; title: string; description: string } => {
    switch (outcome.kind) {
      case "approved":
        return {
          icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
          title: "Device connected",
          description: `${outcome.app_name} is now signed in on your device. You can close this page and return to it.`,
        };
      case "denied":
        return {
          icon: <XCircle className="h-5 w-5 text-destructive" />,
          title: "Request denied",
          description: `${outcome.app_name} was not given access to your account. You can close this page.`,
        };
      case "email_verification_required":
        return {
          icon: <MailWarning className="h-5 w-5 text-amber-600" />,
          title: "Verify your email address first",
          description: `${outcome.message} Verify it from your account page, then enter the code again (it is still valid until it expires).`,
        };
    }
  })();

  return (
    <Card
      className={DEVICE_VERIFICATION_CARD_CLASS_NAME}
      data-testid="device-verification-outcome"
      data-outcome={outcome.kind}
    >
      <CardHeader>
        <CardTitle className="flex flex-row items-center gap-2">
          {content.icon}
          {content.title}
        </CardTitle>
        <CardDescription className="break-words">{content.description}</CardDescription>
      </CardHeader>
      <CardContent />
      <CardFooter className="flex flex-row justify-between gap-3 flex-wrap">
        <Button variant="outline" onClick={onEnterAnotherCode} data-testid="device-enter-another-code">
          Connect another device
        </Button>
        <Button asChild variant={outcome.kind === "email_verification_required" ? "default" : "ghost"}>
          <Link href="/account">Go to your account</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export default DeviceVerificationOutcomeCard;
