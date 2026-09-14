"use client";
import { Building2 } from "lucide-react";
import CustomerHeader from "../customer-header";
import CustomerProfile, { CustomerProfileSkeleton } from "../customer-profile";
import { useSelectedCustomer } from "../use-customer";

// Admin Documents "Customer" page — the full profile of the selected customer.
export default function CustomerPageClient() {
  const { customer, ready, onSelect } = useSelectedCustomer();

  return (
    <div className="flex flex-col h-full">
      <CustomerHeader title="Customer" customer={customer} onSelect={onSelect} />
      <div className="flex-1 overflow-y-auto py-6">
        <div className="px-4 md:px-8">
          {!ready ? (
            <CustomerProfileSkeleton />
          ) : customer ? (
            <CustomerProfile customer={customer} />
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-16 text-center">
              <Building2 className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-[13px] text-muted-foreground">Use the customer selector above to choose a customer.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
