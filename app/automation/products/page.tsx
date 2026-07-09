"use client";
import { Boxes } from "lucide-react";
import { SingleSyncPage } from "../automation-shared";

// Dedicated Products sync page — status, schedule, run-now and a products-only run history.
export default function ProductsSyncPage() {
  return (
    <SingleSyncPage
      type="products"
      title="Products Sync"
      icon={Boxes}
      itemLabel="products changed"
      description="Mirrors the product catalogue one way — T4A is the source of truth and CREAGLOBE is updated to match: differing fields are overwritten and any missing products are created. T4A is never modified."
      howItWorks={
        <>
          <p>
            A strictly <span className="text-foreground font-medium">one-way</span> sync:{" "}
            <span className="text-foreground font-medium">T4A → CREAGLOBE</span>. T4A is the single source of truth and is
            never written to.
          </p>
          <p>
            For every T4A product, CREAGLOBE is brought into line — products missing there are{" "}
            <span className="text-foreground font-medium">created</span>, and fields that differ are{" "}
            <span className="text-foreground font-medium">overwritten</span> with T4A&apos;s values. Products that exist only in
            CREAGLOBE are left untouched.
          </p>
          <p>
            A few fields are deliberately <span className="text-foreground font-medium">not</span> overwritten on existing
            products — <code className="text-[11px]">sales</code>, <code className="text-[11px]">service</code>,{" "}
            <code className="text-[11px]">purchasing</code> and the product code — so each company keeps its own commercial
            settings.
          </p>
        </>
      }
    />
  );
}
