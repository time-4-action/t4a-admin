import { cn } from "@/lib/utils";
import { normalizeIso } from "@/lib/countries-client";

// A country flag for an ISO-2 code, drawn from the `flag-icons` SVG set (the
// stylesheet is imported once in app/layout.tsx; each flag is a lazily fetched
// background SVG, so unused flags cost nothing). Emoji flags were the previous
// approach — they render as bare letters on Windows, which is where the admin
// is mostly used. Sized with `em`, so it follows the surrounding font size;
// pass `className` (e.g. `text-[16px]`) to scale it. Unknown input renders
// nothing.
export function Flag({
  iso,
  square = false,
  className,
}: {
  iso: string | null | undefined;
  /** 1:1 variant instead of the default 4:3. */
  square?: boolean;
  className?: string;
}) {
  const code = normalizeIso(iso);
  if (!code) return null;
  return (
    <span
      role="img"
      aria-label={code}
      title={code}
      className={cn(
        "fi shrink-0 rounded-[3px] align-[-0.15em] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]",
        `fi-${code.toLowerCase()}`,
        square && "fis",
        className,
      )}
    />
  );
}
