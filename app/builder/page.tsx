import Link from "next/link";
import {
  Blocks,
  Radar,
  SlidersHorizontal,
  ChevronRight,
  Download,
  MousePointerClick,
  Eye,
  ClipboardCopy,
} from "lucide-react";
import { BUILDER_SCRIPT_URL } from "@/lib/builder-role";

const builders = [
  {
    href: "/builder/radar-chart",
    icon: Radar,
    title: "Radar Chart",
    badge: "performance octagon",
    desc: "A multi-axis performance chart — a single dataset, or a dropdown that compares several models. Configure the axes, the values, and the colours.",
  },
  {
    href: "/builder/range-bars",
    icon: SlidersHorizontal,
    title: "Range Bars",
    badge: "feel / rider goals",
    desc: "Horizontal bars showing a highlighted band between two poles or across labelled stops — ideal for feel and rider-goal scales. Add as many bars as you need.",
  },
];

const steps = [
  { icon: MousePointerClick, title: "Configure", desc: "Adjust the controls on the left." },
  { icon: Eye, title: "Preview", desc: "See it render live as you type." },
  { icon: ClipboardCopy, title: "Copy", desc: "Paste the HTML snippet into the page." },
];

export default function BuilderHubPage() {
  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex items-center gap-2 min-w-0">
            <Blocks className="w-4 h-4 text-blue-500 shrink-0" />
            <h1 className="font-display text-lg font-medium tracking-tight text-foreground">
              Section Builder
            </h1>
          </div>
          <a
            href="/patrik-components.js"
            download
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            title="Download the renderer script"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">patrik-components.js</span>
          </a>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <p className="text-[13px] text-muted-foreground leading-relaxed max-w-2xl reveal">
            Build ready-to-paste website sections without writing any markup by hand. Pick a
            component, configure it visually, and copy the generated HTML. Each snippet is
            scriptless — it carries only markup and <code className="text-[11px] bg-muted px-1 py-0.5 rounded">data-*</code>{" "}
            config, and is rendered on the live site by a single shared script.
          </p>

          {/* builder cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {builders.map(({ href, icon: Icon, title, badge, desc }, i) => (
              <Link
                key={href}
                href={href}
                className="group bg-surface border border-border rounded-2xl p-5 shadow-sm hover:border-blue-300 dark:hover:border-blue-700/60 hover:shadow-md transition-all reveal flex flex-col"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-blue-500" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-foreground leading-tight group-hover:underline">
                      {title}
                    </h2>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                      {badge}
                    </span>
                  </div>
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed flex-1">{desc}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-blue-600 dark:text-blue-400">
                  Open builder
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            ))}
          </div>

          {/* how it works */}
          <div className="bg-surface border border-border rounded-2xl p-5 reveal" style={{ animationDelay: "140ms" }}>
            <h3 className="text-[12px] font-semibold text-foreground tracking-tight mb-4">How it works</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {steps.map(({ icon: Icon, title, desc }, i) => (
                <div key={title} className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 relative">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-foreground leading-tight">{title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border/60 text-[11px] text-muted-foreground leading-relaxed">
              Every page that uses these components must load the renderer once, near the end of{" "}
              <code className="text-[11px] bg-muted px-1 py-0.5 rounded">&lt;body&gt;</code>. Generated
              snippets reference it at{" "}
              <code className="text-[11px] bg-muted px-1 py-0.5 rounded break-all">{BUILDER_SCRIPT_URL}</code>{" "}
              (set via <code className="text-[11px] bg-muted px-1 py-0.5 rounded">NEXT_PUBLIC_BUILDER_SCRIPT_URL</code>).
              It auto-renders every component on the page — no inline JavaScript needed.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
