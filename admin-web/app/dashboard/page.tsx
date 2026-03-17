"use client";
import { useEffect, useState } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useCurrency } from "@/lib/currency-context";
import { EUR_USD_RATE } from "@/lib/currency";
import { DollarSign, Euro, Users, MessageSquare } from "lucide-react";

const COLORS = ["#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1"];

function CustomTooltip({ active, payload, label }: any) {
  const { fmt } = useCurrency();
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-medium text-foreground mb-0.5">{label}</p>
      <p className="text-muted-foreground">{fmt(payload[0].value)}</p>
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  const { fmt } = useCurrency();
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-medium text-foreground">{payload[0].name}</p>
      <p className="text-muted-foreground">{fmt(payload[0].value)}</p>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-border animate-pulse rounded-lg", className)} />;
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const { currency, fmt } = useCurrency();

  const SpendIcon = currency === "EUR" ? Euro : DollarSign;

  const kpis = [
    { key: "totalCostUsd",  label: "Total spend",         icon: SpendIcon,     fmt: fmt },
    { key: "activeUsers",   label: "Active users",         icon: Users,         fmt: (v: number) => v.toString() },
    { key: "convToday",     label: "Conversations today",  icon: MessageSquare, fmt: (v: number) => v.toString() },
  ];

  const yAxisFmt = (v: number) =>
    currency === "EUR"
      ? `€${(v / EUR_USD_RATE).toFixed(2)}`
      : `$${v.toFixed(2)}`;

  useEffect(() => {
    fetch("/api/admin/stats").then((r) => r.json()).then(setStats);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <header className="h-14 border-b border-border flex items-center px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <h1 className="text-sm font-semibold text-foreground">AI Dashboard</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-5xl">
        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4">
          {!stats
            ? [0,1,2].map(i => <Skeleton key={i} className="h-24" />)
            : kpis.map(({ key, label, icon: Icon, fmt: fmtFn }) => (
                <div key={key} className="bg-background border border-border rounded-xl px-5 py-4 flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
                    <p className="text-2xl font-semibold text-foreground tracking-tight">{fmtFn(stats[key])}</p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mt-0.5 shrink-0">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
              ))}
        </div>

        {stats && (
          <div className="space-y-4">
            {stats.byUser?.length > 0 && (
              <div className="bg-background border border-border rounded-xl p-5">
                <p className="text-xs font-semibold text-foreground mb-4">Cost by user</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.byUser} barCategoryGap="40%">
                    <CartesianGrid vertical={false} stroke="oklch(0.922 0 0)" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "oklch(0.556 0 0)" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={yAxisFmt} tick={{ fontSize: 10, fill: "oklch(0.556 0 0)" }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "oklch(0.97 0 0)" }} />
                    <Bar dataKey="costUsd" fill="oklch(0.208 0.042 264)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {stats.byModel?.length > 0 && (
              <div className="bg-background border border-border rounded-xl p-5">
                <p className="text-xs font-semibold text-foreground mb-4">Cost by model</p>
                <div className="flex items-center gap-10">
                  <div className="shrink-0">
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie data={stats.byModel} dataKey="costUsd" nameKey="modelId" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2} strokeWidth={0}>
                          {stats.byModel.map((_: any, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex-1 space-y-2">
                    {stats.byModel.map((m: any, i: number) => (
                      <li key={m.modelId} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-xs font-mono text-muted-foreground truncate">{m.modelId}</span>
                        </div>
                        <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">{fmt(m.costUsd)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
