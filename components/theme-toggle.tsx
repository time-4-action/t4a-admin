"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "system", icon: Monitor, label: "System" },
  { value: "dark", icon: Moon, label: "Dark" },
];

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();

  if (collapsed) {
    const idx = Math.max(0, OPTIONS.findIndex((o) => o.value === theme));
    const current = OPTIONS[idx];
    const next = OPTIONS[(idx + 1) % OPTIONS.length];
    const Icon = current.icon;
    return (
      <button
        type="button"
        onClick={() => setTheme(next.value)}
        title={`Theme: ${current.label} — click for ${next.label}`}
        aria-label={`Theme: ${current.label}. Switch to ${next.label}.`}
        className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
      >
        <Icon className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex items-center rounded-lg bg-muted p-0.5"
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            title={label}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md text-[11px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
