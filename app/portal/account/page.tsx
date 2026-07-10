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
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-4 md:px-8">
          <h1 className="font-display text-lg font-medium tracking-tight text-foreground truncate">My Account</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto py-6">
        <div className="px-4 md:px-8">
          <CustomerProfile customer={partner} />
        </div>
      </div>
    </div>
  );
}
