// Saved build detail — server wrapper that stamps the viewer from the Auth0
// session (used client-side to mark "your" notes as deletable).
import { auth0 } from "@/lib/auth";
import SavedBuildClient from "./saved-build-client";

export default async function SavedBuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth0.getSession();
  const viewer = {
    id: session?.user?.sub ?? "",
    name: session?.user?.name ?? session?.user?.email ?? "Admin",
    email: session?.user?.email ?? "",
  };
  return <SavedBuildClient id={id} viewer={viewer} />;
}
