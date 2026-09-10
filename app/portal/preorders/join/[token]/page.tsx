import JoinClient from "./join-client";

// The customer invite ("magic") link target. It lives under /portal so middleware
// forces login first (returning here afterward); JoinClient then unlocks the campaign
// for the matched partner and redirects into the fill page.
export default async function PreorderJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <JoinClient token={token} />;
}
