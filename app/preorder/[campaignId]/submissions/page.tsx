import SubmissionsClient from "./submissions-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  return <SubmissionsClient campaignId={campaignId} />;
}
