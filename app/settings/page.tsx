"use client";
import { useCurrency } from "@/lib/currency-context";
import { cn } from "@/lib/utils";
import { DollarSign, Euro } from "lucide-react";

export default function SettingsPage() {
  const { currency, toggle } = useCurrency();

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b border-border flex items-center px-4 md:px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <h1 className="font-display text-lg font-medium tracking-tight text-foreground">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-2xl space-y-2">
        {/* Section label */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1 pb-1">Display</p>

        <div className="bg-background border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-[13px] font-semibold text-foreground">Currency</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">How monetary values are displayed throughout the app.</p>
            </div>
            <div className="flex items-center rounded-xl bg-muted p-1 gap-0.5 shrink-0 ml-6">
              <button
                onClick={() => currency !== "USD" && toggle()}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150",
                  currency === "USD"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <DollarSign className="w-3 h-3" />
                USD
              </button>
              <button
                onClick={() => currency !== "EUR" && toggle()}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150",
                  currency === "EUR"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Euro className="w-3 h-3" />
                EUR
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
