import { redirect } from "next/navigation";
import FillClient from "./fill-client";
import { getSessionPartner } from "@/lib/portal";
import { CustomerInfoStrip } from "@/app/documents/customer-header";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const partner = await getSessionPartner();
  if (!partner) redirect("/portal/no-account");
  // The same customer strip the document lists open with, rendered server-side.
  return <FillClient campaignId={campaignId} customerStrip={<CustomerInfoStrip customer={partner} />} />;
}
