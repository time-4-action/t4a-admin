"use client";

// components/ui/drawer.tsx
//
// Right-anchored side panel built on the Radix Dialog primitive. NON-modal by
// default (`modal={false}`): the page underneath stays interactive — the markets
// map keeps responding to clicks while a market/customer drawer is open — and no
// overlay is painted. Pass `modal` for a blocking variant (adds a dimmed overlay).
// Structure: sticky header (title + close) · scrollable body · optional sticky footer.

import * as React from "react";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modal?: boolean;
  /** Tailwind width class(es); defaults to a 440px panel capped at the viewport. */
  widthClassName?: string;
  className?: string;
  children: React.ReactNode;
};

function Drawer({ open, onOpenChange, modal = false, widthClassName, className, children }: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogPrimitive.Portal>
        {modal && (
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        )}
        <DialogPrimitive.Content
          data-slot="drawer-content"
          onInteractOutside={(e) => {
            // Non-modal: clicking the page must not close the panel (the map is the
            // primary way to change the selection while a drawer is open).
            if (!modal) e.preventDefault();
          }}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex flex-col border-l border-border bg-background shadow-xl outline-none",
            widthClassName ?? "w-[440px] max-w-full",
            className,
          )}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DrawerHeader({
  title,
  description,
  right,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("shrink-0 border-b border-border px-5 py-4", className)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="font-display text-[15px] font-medium tracking-tight text-foreground truncate">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-0.5 text-[12px] text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">Panel</DialogPrimitive.Description>
          )}
        </div>
        {right}
        <DialogPrimitive.Close
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
          aria-label="Close"
        >
          <XIcon className="size-4" />
        </DialogPrimitive.Close>
      </div>
      {children}
    </div>
  );
}

function DrawerBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)}>{children}</div>;
}

function DrawerFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("shrink-0 border-t border-border bg-background/95 px-5 py-3 backdrop-blur-sm", className)}>
      {children}
    </div>
  );
}

export { Drawer, DrawerHeader, DrawerBody, DrawerFooter };
