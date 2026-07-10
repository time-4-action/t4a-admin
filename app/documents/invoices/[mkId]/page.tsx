import { AdminDetailPage } from "../../documents-admin-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ mkId: string }> }) {
  const { mkId } = await params;
  return <AdminDetailPage kind="invoice" mkId={decodeURIComponent(mkId)} />;
}
