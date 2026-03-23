"use client";

import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { CreateOrganizationForm } from "@schemavaults/auth-ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@schemavaults/ui";
import PageContainer from "@/components/PageContainer";

export default function CreateOrganizationPageView(): ReactElement {
  const router = useRouter();

  return (
    <PageContainer>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Create a new organization</CardTitle>
          <CardDescription>
            Create a new organization to group users and resources together.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrganizationForm
            onSuccess={(organization_id: string): void => {
              router.push(`/org/${organization_id}`);
            }}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
