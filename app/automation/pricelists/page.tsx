"use client";
import { Tags } from "lucide-react";
import { SingleSyncPage } from "../automation-shared";
import PricelistMappingEditor from "./mapping-editor";

// Dedicated Pricelists (price) sync page — status, schedule, run-now, a dry-run preview,
// the price-list mapping editor, and a pricelists-only run history.
export default function PricelistsSyncPage() {
  return (
    <SingleSyncPage
      type="pricelists"
      title="Pricelists Sync"
      icon={Tags}
      itemLabel="prices written"
      previewable
      description="Copies product prices one way — T4A is the source of truth and CREAGLOBE is updated to match — but only for the price-list pairs mapped below. T4A is never modified."
      extra={<PricelistMappingEditor />}
      howItWorks={
        <>
          <p>
            A strictly <span className="text-foreground font-medium">one-way</span> sync:{" "}
            <span className="text-foreground font-medium">T4A → CREAGLOBE</span>. T4A is the single source of truth and
            is never written to.
          </p>
          <p>
            Metakocka has <span className="text-foreground font-medium">no endpoint that lists price lists</span>, so
            both companies&apos; lists are discovered by scanning the catalogue — every product reports the lists it sits
            on. A list with no products on it cannot be seen this way.
          </p>
          <p>
            A list&apos;s code is a <span className="text-foreground font-medium">per-company counter</span> and does not
            match across companies: T4A <span className="font-mono">7</span> is PP GOLD 2026 while CREAGLOBE{" "}
            <span className="font-mono">7</span> is PP BRONZE 2026. Nothing is guessed — only the pairs you map below are
            ever synced. Products themselves are matched by SKU (<span className="font-mono">code</span>), which does line
            up 1:1.
          </p>
          <p>
            For each mapped pair: a product priced in T4A but missing from the CREAGLOBE list is{" "}
            <span className="text-foreground font-medium">added</span>; one already there is{" "}
            <span className="text-foreground font-medium">updated</span> when any price field T4A sets differs. Fields
            only CREAGLOBE has are carried through untouched, and a product on the CREAGLOBE list that T4A does not price
            is <span className="text-foreground font-medium">left alone</span> and merely counted.
          </p>
          <p>
            Each pair can carry a <span className="text-foreground font-medium">max change %</span>. Any single price
            moving further than that is refused and reported instead of written — the guard against two lists that hold
            different kinds of number (net vs gross) quietly rewriting a whole catalogue.
          </p>
          <p>
            Use <span className="text-foreground font-medium">Preview (dry run)</span> to see exactly what a run would
            add and update <span className="text-foreground font-medium">without writing anything</span> to CREAGLOBE.
          </p>
        </>
      }
    />
  );
}
