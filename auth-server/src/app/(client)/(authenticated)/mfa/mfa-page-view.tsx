"use client";

import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import { TotpSettingsCard } from "@/components/Mfa";
import { PasskeysSettingsCard } from "@/components/Passkeys";

export default function MfaPageView(): ReactElement {
  const cardsClassName = "grow";

  return (
    <PageContainer>
      <TotpSettingsCard className={cardsClassName} />
      <PasskeysSettingsCard className={cardsClassName} />
    </PageContainer>
  );
}
