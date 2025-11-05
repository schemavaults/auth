"use client";

import { AccountDetailsCard, AppsCard } from "@schemavaults/auth-ui";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import type { PreloadedAppsTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import {
  useAdmin,
  useAppEnvironment,
  useCurrentUser,
} from "@schemavaults/auth-react-provider";
import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";

export interface AuthAccountPageViewProps {
  preloaded_authorized_apps_data?: PreloadedAppsTableDataWithDomainRefs;
}

export default function AccountPageView({
  preloaded_authorized_apps_data,
}: AuthAccountPageViewProps): ReactElement {
  const router = useRouter();
  const environment = useAppEnvironment();
  const admin: boolean = useAdmin();
  const user = useCurrentUser();

  const cardsClassName = "w-full md:max-w-[60vw] lg:max-w-[80vw]";

  return (
    <PageContainer>
      <AccountDetailsCard
        Link={Link}
        redirect={async (url: string): Promise<void> => {
          if (url.startsWith("https://")) {
            window.location.href = url;
            return;
          } else if (
            url.startsWith("http://") &&
            environment !== "development" &&
            environment !== "test"
          ) {
            // not an appropriate environment to use insecure transport
            console.error(
              "Inappropriate environment to use insecure transport",
            );
            throw new Error("Cannot redirect to http:// url");
          }
          router.push(url);
          return;
        }}
        cardClassName={cardsClassName}
        isAuthServerAccountPage
        isAdmin={admin}
        user={user}
        appEnvironment={environment}
      />
      <AppsCard
        cardTitle="Authorized Applications"
        cardClassName={cardsClassName}
        queryType="authorized"
        preloaded={preloaded_authorized_apps_data}
      />
    </PageContainer>
  );
}
