"use client";

import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { CreateOrganizationForm } from "@schemavaults/auth-ui";
import PageContainer from "@/components/PageContainer";

export default function CreateOrganizationPageView(): ReactElement {
  const router = useRouter();

  return (
    <PageContainer>
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-2">Create a new organization</h1>
        <p className="text-muted-foreground mb-6">
          Create a new organization to group users and resources together.
        </p>
        <CreateOrganizationForm
          onSuccess={(organization_id: string): void => {
            router.push(`/org/${organization_id}`);
          }}
        />
      </div>
    </PageContainer>
  );
}
