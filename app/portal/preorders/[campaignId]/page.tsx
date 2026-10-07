import FillClient from "./fill-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ account?: string | string[] }>;
}) {
  const { campaignId } = await params;
  // A portal agent filling for a client: `?account=<partnerMkId>` (re-checked by
  // every preorder route against the agent's accounts).
  const { account } = await searchParams;
  const acc = typeof account === "string" ? account : "";
  return <FillClient key={`${campaignId}:${acc}`} campaignId={campaignId} account={acc} />;
}
