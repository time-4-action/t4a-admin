"use client";
import { Users } from "lucide-react";
import { SingleSyncPage } from "../automation-shared";

// Dedicated Customers (partner) sync page — status, schedule, run-now, a dry-run preview and a
// customers-only run history.
export default function CustomersSyncPage() {
  return (
    <SingleSyncPage
      type="customers"
      title="Customers Sync"
      icon={Users}
      itemLabel="customers changed"
      previewable
      description="Mirrors customers (partners) one way — T4A is the source of truth and CREAGLOBE is updated to match: matching customers are updated and missing ones are created. T4A is never modified."
      howItWorks={
        <>
          <p>
            A strictly <span className="text-foreground font-medium">one-way</span> sync:{" "}
            <span className="text-foreground font-medium">T4A → CREAGLOBE</span>. T4A is the single source of truth and is
            never written to.
          </p>
          <p>
            Unlike products, partners share <span className="text-foreground font-medium">no code</span> between the two
            companies, so a customer is matched by <span className="text-foreground font-medium">tax number</span> first and
            by <span className="text-foreground font-medium">name</span> as a fallback. A T4A customer that matches an existing
            CREAGLOBE one is <span className="text-foreground font-medium">updated</span>; one that matches nothing is{" "}
            <span className="text-foreground font-medium">created</span>.
          </p>
          <p>
            Contacts and delivery addresses are synced too. They&apos;re matched by content (so repeat runs don&apos;t
            duplicate them) — the billing address is updated in place and any missing contacts / addresses are added.
          </p>
          <p>
            Use <span className="text-foreground font-medium">Preview (dry run)</span> to see exactly what a run would create
            and update <span className="text-foreground font-medium">without writing anything</span> to CREAGLOBE.
          </p>
        </>
      }
    />
  );
}
