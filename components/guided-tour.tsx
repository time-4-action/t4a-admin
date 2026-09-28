"use client";

// components/guided-tour.tsx — a spotlight walkthrough.
//
// Each step points at an element marked `data-tour="<target>"`: the page dims, the
// element is cut out of the dim with a soft ring, and a card beside it explains it.
// A step without a target (or whose element is not on the page) shows a centred
// card. The host can react to step changes (`onStep`) — e.g. switch a view so the
// next target exists — and the tour waits a frame for it to render before measuring.
// Keyboard: → / Enter next, ← back, Esc closes.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TourStep = {
  target?: string;
  title: string;
  body: ReactNode;
  icon?: ReactNode;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const CARD_W = 360;
const GAP = 14;

function findTarget(target?: string): HTMLElement | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

export function GuidedTour({
  steps,
  open,
  onClose,
  onStep,
}: {
  steps: TourStep[];
  open: boolean;
  /** `completed` = the last step's Finish, not Skip / Esc. */
  onClose: (completed: boolean) => void;
  onStep?: (index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [card, setCard] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Let the host prepare the page for this step (switch a view, …).
  useEffect(() => {
    if (open) onStep?.(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  const measure = useCallback(() => {
    const el = findTarget(step?.target);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step?.target]);

  // Bring the target into view (after the host re-rendered), then measure.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const t = window.setTimeout(() => {
      const el = findTarget(step?.target);
      if (el) {
        const r = el.getBoundingClientRect();
        const offscreen = r.top < 80 || r.bottom > window.innerHeight - 40;
        if (offscreen) el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? "start" : "center", behavior: "smooth" });
      }
      measure();
      // Re-measure while a smooth scroll settles.
      let n = 0;
      const tick = () => {
        measure();
        if (++n < 30) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, 60);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [open, index, step?.target, measure]);

  useEffect(() => {
    if (!open) return;
    const on = () => measure();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [open, measure]);

  // Place the card beside the spotlight: below if it fits, else above, else centred.
  useLayoutEffect(() => {
    if (!open) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(CARD_W, vw - 32);
    const h = cardRef.current?.offsetHeight ?? 220;
    if (!rect) {
      setCard({ top: Math.max(16, (vh - h) / 2), left: (vw - w) / 2 });
      return;
    }
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), vw - w - 16);
    if (rect.top + rect.height + GAP + h < vh - 16) setCard({ top: rect.top + rect.height + GAP, left });
    else if (rect.top - GAP - h > 16) setCard({ top: rect.top - GAP - h, left });
    else {
      // Tall target: sit beside it if there is room, else pin to the bottom.
      const side = rect.left + rect.width + GAP + w < vw - 16 ? rect.left + rect.width + GAP : rect.left - GAP - w;
      if (side > 16) setCard({ top: Math.min(Math.max(16, rect.top), vh - h - 16), left: side });
      else setCard({ top: vh - h - 16, left });
    }
  }, [open, rect, index]);

  const next = useCallback(() => (last ? onClose(true) : setIndex((i) => i + 1)), [last, onClose]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, onClose]);

  if (!open || !step || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Dim + spotlight: one box whose huge shadow is the dim, so the hole animates. */}
      {rect ? (
        <div
          className="fixed rounded-xl ring-2 ring-lime-400/90 transition-all duration-300 ease-out pointer-events-none"
          style={{ ...rect, boxShadow: "0 0 0 9999px rgba(10, 12, 16, 0.62)" }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgba(10,12,16,0.62)] transition-opacity" />
      )}
      {/* Swallows clicks so the page can't be used mid-tour. */}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

      <div
        ref={cardRef}
        className="fixed rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl transition-[top,left] duration-300 ease-out"
        style={{ width: Math.min(CARD_W, typeof window !== "undefined" ? window.innerWidth - 32 : CARD_W), top: card?.top ?? -9999, left: card?.left ?? -9999 }}
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            {step.icon && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-lime-500/12 text-lime-700 dark:text-lime-400">{step.icon}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-muted-foreground tabular-nums">
                Step {index + 1} of {steps.length}
              </div>
              <h2 id="tour-title" className="mt-0.5 text-[15px] font-semibold text-foreground leading-snug">
                {step.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onClose(false)}
              className="-mr-1 -mt-1 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label="Close guide"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{step.body}</div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <div className="flex items-center gap-1" aria-hidden>
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn("h-1.5 rounded-full transition-all duration-300", i === index ? "w-4 bg-lime-500" : "w-1.5 bg-muted-foreground/25")}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index === 0 ? (
              <Button variant="ghost" size="sm" onClick={() => onClose(false)} className="h-8 text-[12px] text-muted-foreground">
                Skip
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={back} className="h-8 text-[12px]">
                <ArrowLeft className="size-3.5" /> Back
              </Button>
            )}
            <Button size="sm" onClick={next} autoFocus className="h-8 text-[12px] min-w-20">
              {last ? "Got it" : index === 0 ? "Show me" : "Next"}
              {!last && <ArrowRight className="size-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
