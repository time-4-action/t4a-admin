import { PortalDetailPage } from "@/app/portal/portal-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ mkId: string }> }) {
  const { mkId } = await params;
  return <PortalDetailPage kind="order" mkId={decodeURIComponent(mkId)} />;
}
