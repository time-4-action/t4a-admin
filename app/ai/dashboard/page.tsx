"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useCurrency } from "@/lib/currency-context";
import { EUR_USD_RATE } from "@/lib/currency";
import { DollarSign, Euro, Users, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Wired through CSS custom properties so dark mode swaps automatically.
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

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


export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const { currency, fmt } = useCurrency();
  const router = useRouter();

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
      <header className="h-14 border-b border-border flex items-center px-4 md:px-8 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <h1 className="font-display text-lg font-medium tracking-tight text-foreground">AI Dashboard</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-5xl">
        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {!stats
            ? [0,1,2].map(i => (
                <div key={i} className="bg-background border border-border rounded-xl px-5 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2.5 mt-0.5">
                      <Skeleton className="h-2.5 w-20 rounded-lg" delay={i * 100} />
                      <Skeleton className="h-7 w-24 rounded-lg" delay={i * 100 + 60} />
                    </div>
                    <Skeleton className="w-8 h-8 rounded-lg shrink-0" delay={i * 100 + 30} />
                  </div>
                </div>
              ))
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

        <div className="space-y-4">
          {/* Bar chart — Cost by user */}
          {!stats ? (
            <div className="bg-background border border-border rounded-xl p-5">
              <Skeleton className="h-3 w-20 mb-5 rounded-lg" />
              <div className="flex gap-3 h-[220px]">
                <div className="flex flex-col justify-between py-1 shrink-0 w-[60px] items-end pr-1">
                  {[0,1,2,3,4].map(i => (
                    <Skeleton key={i} className="h-2 w-10 rounded" delay={i * 40} />
                  ))}
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex-1 flex items-end gap-2 pb-1">
                    {[55, 85, 40, 100, 65, 75, 30].map((h, i) => (
                      <Skeleton
                        key={i}
                        className="flex-1 rounded-t"
                        style={{ height: `${h}%` }}
                        delay={i * 60}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    {[0,1,2,3,4,5,6].map(i => (
                      <div key={i} className="flex-1 flex justify-center">
                        <Skeleton className="h-2 w-8 rounded" delay={i * 50} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : stats.byUser?.length > 0 ? (
            <div className="bg-background border border-border rounded-xl p-5">
              <p className="text-xs font-semibold text-foreground mb-4">Cost by user</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.byUser} barCategoryGap="40%">
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={yAxisFmt} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted)" }} />
                  <Bar
                    dataKey="costUsd"
                    fill="var(--foreground)"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={(data: any) => {
                      if (data?.userId) router.push(`/users/${encodeURIComponent(data.userId)}`);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {/* Pie chart — Cost by model */}
          {!stats ? (
            <div className="bg-background border border-border rounded-xl p-5">
              <Skeleton className="h-3 w-24 mb-5 rounded-lg" />
              <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
                <div className="shrink-0 w-[180px] h-[180px] relative">
                  <Skeleton className="absolute inset-0 rounded-full" />
                  <div className="absolute inset-[30px] rounded-full bg-background" />
                </div>
                <ul className="flex-1 space-y-2 w-full">
                  {[80, 60, 100, 45, 70].map((w, i) => (
                    <li key={i} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="w-2 h-2 rounded-full shrink-0" delay={i * 60} />
                        <Skeleton className="h-2.5 rounded" style={{ width: w }} delay={i * 60 + 30} />
                      </div>
                      <Skeleton className="h-2.5 w-10 rounded shrink-0" delay={i * 60 + 60} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : stats.byModel?.length > 0 ? (
            <div className="bg-background border border-border rounded-xl p-5">
              <p className="text-xs font-semibold text-foreground mb-4">Cost by model</p>
              <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
                <div className="shrink-0">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={stats.byModel} dataKey="costUsd" nameKey="modelId" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2} strokeWidth={0}>
                        {stats.byModel.map((_: any, i: number) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-2 w-full">
                  {stats.byModel.map((m: any, i: number) => (
                    <li key={m.modelId} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-xs font-mono text-muted-foreground truncate">{m.modelId}</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">{fmt(m.costUsd)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
