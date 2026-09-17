import { PortalListPage } from "@/app/portal/portal-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function Page() {
  return <PortalListPage kind="credit-note" />;
}
