import { redirect } from "next/navigation";
import { getSessionPartner } from "@/lib/portal";
import CustomerProfile from "@/app/documents/customer-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The logged-in customer's own account/company details (same profile the admin
// sees). Partner resolved from the session email.
export default async function Page() {
  const partner = await getSessionPartner();
  if (!partner) redirect("/portal/no-account");

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border bg-gradient-to-b from-muted/30 to-transparent">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">
          <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight leading-none">
            My Account
          </h1>
          <p className="text-[13px] text-muted-foreground mt-2">Your company and contact details.</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-6">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <CustomerProfile customer={partner} />
        </div>
      </div>
    </div>
  );
}
