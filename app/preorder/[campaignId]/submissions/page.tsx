import SubmissionsClient from "./submissions-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `?stage=` deep-links a filter (the overview's failures banner uses `failures`).
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { campaignId } = await params;
  const { stage } = await searchParams;
  return <SubmissionsClient campaignId={campaignId} initialStage={stage} />;
}
