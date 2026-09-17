"use client";

// components/ui/editor-modal.tsx
//
// A large, centred editing surface built on the Radix Dialog primitive — the
// "open it big" counterpart of components/ui/drawer.tsx for things that need
// room (a customer's whole configuration, not a quick tweak). Always modal
// (dimmed, blurred backdrop). Structure: sticky header (title + meta + actions +
// close) · body that fills the remaining height (callers lay it out, typically
// as two scrolling columns) · optional sticky footer.

import * as React from "react";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

type EditorModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tailwind size classes; defaults to a 1120×860 surface capped at the viewport. */
  sizeClassName?: string;
  className?: string;
  children: React.ReactNode;
};

function EditorModal({ open, onOpenChange, sizeClassName, className, children }: EditorModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-slot="editor-modal-content"
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl outline-none",
            "duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            sizeClassName ?? "w-[min(1120px,calc(100vw-2rem))] h-[min(860px,calc(100vh-2rem))]",
            className,
          )}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function EditorModalHeader({
  title,
  description,
  leading,
  right,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Something in front of the title — an avatar, an icon tile. */
  leading?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("shrink-0 border-b border-border px-6 py-4", className)}>
      <div className="flex items-start gap-4">
        {leading}
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="font-display text-[18px] font-medium tracking-tight text-foreground truncate">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description asChild>
              <div className="mt-1 text-[12px] text-muted-foreground">{description}</div>
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">Editor</DialogPrimitive.Description>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {right}
          <DialogPrimitive.Close
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
            aria-label="Close"
          >
            <XIcon className="size-4" />
          </DialogPrimitive.Close>
        </div>
      </div>
      {children}
    </div>
  );
}

function EditorModalBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("min-h-0 flex-1", className)}>{children}</div>;
}

function EditorModalFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("shrink-0 border-t border-border bg-background/95 px-6 py-3 backdrop-blur-sm", className)}>
      {children}
    </div>
  );
}

export { EditorModal, EditorModalHeader, EditorModalBody, EditorModalFooter };
