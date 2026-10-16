"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { deliveryDateIso, parseDeliveryDate } from "@/lib/delivery-date";

// <input type="date"> for the requested delivery date. Pasting into a native date
// field can leave a junk value (e.g. a 6-digit year) that Metakocka later rejects,
// so a paste is parsed as text ("15.11.2026", "2026-11-15", ...) and only a real
// date ever reaches `onChange`. Half-typed values stay local until they are valid.
export function DeliveryDateInput({
  value,
  onChange,
  className,
}: {
  value: string | null | undefined; // ISO
  onChange: (iso: string | null) => void;
  className?: string;
}) {
  const committed = parseDeliveryDate(value) ?? "";
  const [raw, setRaw] = React.useState(committed);
  React.useEffect(() => setRaw(committed), [committed]);
  const invalid = raw !== "" && !parseDeliveryDate(raw);

  return (
    <>
      <Input
        type="date"
        value={raw}
        min="2000-01-01"
        max="2100-12-31"
        onChange={(e) => {
          setRaw(e.target.value);
          if (!e.target.value) onChange(null);
          else if (parseDeliveryDate(e.target.value)) onChange(deliveryDateIso(e.target.value));
        }}
        onPaste={(e) => {
          const parsed = parseDeliveryDate(e.clipboardData.getData("text"));
          if (!parsed) return;
          e.preventDefault();
          setRaw(parsed);
          onChange(deliveryDateIso(parsed));
        }}
        onBlur={() => invalid && setRaw(committed)}
        aria-invalid={invalid || undefined}
        className={className}
      />
      {invalid && <p className="mt-1 text-[11px] text-destructive">Not a valid date, use dd.mm.yyyy.</p>}
    </>
  );
}
