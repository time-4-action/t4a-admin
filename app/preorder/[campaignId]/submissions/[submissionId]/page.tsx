import SubmissionClient from "./submission-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ campaignId: string; submissionId: string }>;
}) {
  const { campaignId, submissionId } = await params;
  return <SubmissionClient campaignId={campaignId} submissionId={submissionId} />;
}
