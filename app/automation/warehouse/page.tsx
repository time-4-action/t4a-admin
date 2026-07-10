"use client";
import { Warehouse } from "lucide-react";
import { SingleSyncPage } from "../automation-shared";

// Dedicated Warehouse sync page — status, schedule, run-now and a warehouse-only run history.
export default function WarehouseSyncPage() {
  return (
    <SingleSyncPage
      type="warehouse"
      title="Warehouse Sync"
      icon={Warehouse}
      itemLabel="items synced"
      description="Reads available (free) stock from the T4A warehouse and writes it into its matching virtual warehouse inside the CREAGLOBE Metakocka company. The ProMode / Germany source is retired."
      howItWorks={
        <>
          <p>
            Pulls the <span className="text-foreground font-medium">free (available-to-sell) stock</span> for every product
            in the T4A Metakocka warehouse — physical on-hand minus reservations — and writes it into T4A&apos;s matching
            virtual warehouse inside the CREAGLOBE company. Stock is kept per warehouse, never merged.
          </p>
          <p>
            The old <span className="text-foreground font-medium">ProMode / Germany</span> source (a CSV feed written into a
            separate CREAGLOBE Germany warehouse) is <span className="text-foreground font-medium">retired</span> and no longer
            synced, so warehouse sync is now T4A-only.
          </p>
          <p>
            Per-product failures reported by Metakocka (e.g. &ldquo;product not found&rdquo;) are captured on each run — open
            a run to see exactly which items failed and why.
          </p>
        </>
      }
    />
  );
}
