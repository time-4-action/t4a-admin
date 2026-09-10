import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * Skeleton primitives.
 *
 * Every loading state in the app is a structural twin of the loaded UI: the
 * wrapper (card / grid / table row) keeps its real classes and only the leaves
 * shimmer. Rules of thumb:
 *
 *  - `delay` goes on a leaf `<Skeleton>`, never on a wrapper — the shimmer
 *    keyframe lives on `.skeleton` (app/globals.css), so a delay on anything
 *    else is a no-op.
 *  - Use fixed `w-*` where the loaded content is fixed width; `flex-1` / a
 *    fraction only where the real text is fluid.
 *  - Match line heights to the real text: a `text-[10px]` pill is ~h-[18px],
 *    a `text-[11px]` pill ~h-5, `text-2xl` ~h-7, inputs are h-8 / h-9 as real.
 *  - Static chrome (section titles, table headers, back links) renders for
 *    real — only data shimmers.
 */

/** Cascading animation delay in ms for the i-th leaf. */
export function stagger(i: number, step = 80, offset = 0): number {
  return offset + i * step
}

type SkeletonProps = React.ComponentProps<"div"> & {
  /** Animation delay in ms (see `stagger`). */
  delay?: number
}

function Skeleton({ className, delay, style, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("skeleton rounded", className)}
      style={delay ? { animationDelay: `${delay}ms`, ...style } : style}
      {...props}
    />
  )
}

/** A line of text. `w` = width class, `h` = line-height class. */
function SkeletonText({
  w = "w-24",
  h = "h-3",
  className,
  ...props
}: SkeletonProps & { w?: string; h?: string }) {
  return <Skeleton className={cn(h, w, className)} {...props} />
}

/**
 * A text line that occupies the real line box: `lh` is the loaded text's
 * line-height class (e.g. "h-[18px]" for text-[12px]), `h` the visible bar.
 * Use it wherever the surrounding row height is set by the text so the
 * skeleton row is exactly as tall as the loaded one.
 */
function SkeletonLine({
  lh = "h-[18px]",
  w = "w-24",
  h = "h-3",
  className,
  ...props
}: SkeletonProps & { lh?: string; w?: string; h?: string }) {
  return (
    <div className={cn("flex items-center", lh, className)}>
      <Skeleton className={cn(h, w)} {...props} />
    </div>
  )
}

/** A round avatar. `size` = width+height classes, e.g. "w-7 h-7". */
function SkeletonAvatar({
  size = "w-7 h-7",
  className,
  ...props
}: SkeletonProps & { size?: string }) {
  return (
    <Skeleton className={cn("rounded-full shrink-0", size, className)} {...props} />
  )
}

/** A rounded-full badge / chip. */
function SkeletonPill({
  w = "w-16",
  h = "h-5",
  className,
  ...props
}: SkeletonProps & { w?: string; h?: string }) {
  return (
    <Skeleton className={cn("rounded-full shrink-0", h, w, className)} {...props} />
  )
}

/** A button-shaped block (rounded-md by default). */
function SkeletonButton({
  w = "w-20",
  h = "h-8",
  className,
  ...props
}: SkeletonProps & { w?: string; h?: string }) {
  return (
    <Skeleton className={cn("rounded-md shrink-0", h, w, className)} {...props} />
  )
}

/**
 * Accessible wrapper for a loading region: announces "Loading" to screen
 * readers and marks the subtree busy. Purely semantic — no styling.
 */
function SkeletonRegion({
  label = "Loading",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={className}
      {...props}
    >
      {children}
      <span className="sr-only">{label}</span>
    </div>
  )
}

export {
  Skeleton,
  SkeletonText,
  SkeletonLine,
  SkeletonAvatar,
  SkeletonPill,
  SkeletonButton,
  SkeletonRegion,
}
