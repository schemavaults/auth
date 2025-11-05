"use client";

import { Wordmark } from "@schemavaults/ui";
import type { ReactElement } from "react";
import { PageContainer } from "@/components/PageContainer";

export default function AdminPageView(): ReactElement {
  return (
    <PageContainer>
      <div className="w-full flex items-center justify-center">
        <h2 className="text-2xl">
          <Wordmark /> Admin Dashboard
        </h2>
      </div>
    </PageContainer>
  );
}
