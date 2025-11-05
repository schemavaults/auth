import "server-only";
import type { ReactElement } from "react";

import AdminPageView from "./admin_page_view";

export default async function AuthServerAdminDashboardPage(): Promise<ReactElement> {
  return <AdminPageView />;
}
