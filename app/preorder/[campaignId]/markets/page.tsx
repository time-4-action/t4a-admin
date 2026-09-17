import { Suspense } from "react";
import MarketsClient from "./markets-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  // useSearchParams() in the client needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={null}>
      <MarketsClient campaignId={campaignId} />
    </Suspense>
  );
}
