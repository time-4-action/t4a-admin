"use client";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Check, UserRound, X, Users, ChevronsUpDown } from "lucide-react";
import type { WarrantyAdmin } from "@/types/warranty";
import { cn } from "@/lib/utils";
import { SkeletonAvatar, SkeletonLine, stagger } from "@/components/ui/skeleton";

const ROW_BASE =
  "flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none";

/** Twin of a person row in both pickers: 28px avatar + name / email lines. */
function AssigneeListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-4 py-2">
          <SkeletonAvatar size="h-7 w-7" delay={stagger(i)} />
          <span className="min-w-0 flex-1">
            <SkeletonLine lh="h-[19.5px]" w="w-28" delay={stagger(i, 80, 20)} />
            <SkeletonLine lh="h-[16.5px]" h="h-2.5" w="w-40" delay={stagger(i, 80, 40)} />
          </span>
        </div>
      ))}
    </>
  );
}

/** Profile picture for a warranty-admin, falling back to an initial / icon. */
export function AssigneeAvatar({
  name,
  picture,
  className,
}: {
  name?: string | null;
  picture?: string;
  className?: string;
}) {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? "";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted font-semibold leading-none text-foreground/80",
        className,
      )}
    >
      {picture ? (
        // Auth0 pictures come from arbitrary hosts (Google, Gravatar, …); a
        // plain <img> avoids next/image remote-host config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={picture}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : initial ? (
        initial
      ) : (
        <UserRound className="h-1/2 w-1/2 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}

/** Picture URL for the admin whose display name matches `name`, if any. */
export function adminPicture(
  admins: WarrantyAdmin[],
  name?: string | null,
): string | undefined {
  if (!name) return undefined;
  return admins.find((a) => a.name === name)?.picture;
}

/**
 * Picture URL for a person identified by name and/or email — matches email
 * first (more stable), then name. Used to put Auth0 avatars on note authors and
 * change-history actors, who are stored as plain name/email strings.
 */
export function pictureForPerson(
  admins: WarrantyAdmin[],
  name?: string | null,
  email?: string | null,
): string | undefined {
  if (email) {
    const byEmail = admins.find((a) => a.email && a.email === email)?.picture;
    if (byEmail) return byEmail;
  }
  if (name) return admins.find((a) => a.name === name)?.picture;
  return undefined;
}

/**
 * Modal assignee picker: searchable list of warranty-admin users with profile
 * pictures. Controlled via `open`/`onOpenChange`. Calls `onSelect(name | null)`
 * (null clears the assignee) and closes.
 */
export function AssigneePicker({
  open,
  onOpenChange,
  admins,
  loading,
  value,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admins: WarrantyAdmin[];
  loading: boolean;
  value: string | null;
  onSelect: (name: string | null) => void;
}) {
  const [q, setQ] = useState("");

  // Surface the current assignee even if that user no longer holds the role
  // (legacy / removed admin) so it stays visible and selectable.
  const list = useMemo<WarrantyAdmin[]>(() => {
    if (value && !admins.some((a) => a.name === value)) {
      return [{ id: `legacy:${value}`, name: value, email: "" }, ...admins];
    }
    return admins;
  }, [admins, value]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term),
    );
  }, [list, q]);

  function close(next: string | null) {
    onSelect(next);
    onOpenChange(false);
    setQ("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQ("");
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border px-4 pt-4 pb-3">
          <DialogTitle className="text-[15px]">Assign claim</DialogTitle>
        </DialogHeader>

        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              className="h-9 pl-8 text-[13px]"
            />
          </div>
        </div>

        <div className="max-h-[min(60vh,340px)] overflow-y-auto py-1.5">
          {/* Unassigned */}
          <button type="button" className={ROW_BASE} onClick={() => close(null)}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
              <X className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="flex-1 text-[13px] text-muted-foreground italic">
              Unassigned
            </span>
            {value == null && <Check className="h-4 w-4 text-primary" aria-hidden />}
          </button>

          {loading ? (
            <AssigneeListSkeleton />
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
              No people match “{q}”.
            </p>
          ) : (
            filtered.map((a) => {
              const selected = value === a.name;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={cn(ROW_BASE, selected && "bg-muted/40")}
                  onClick={() => close(a.name)}
                >
                  <AssigneeAvatar
                    name={a.name}
                    picture={a.picture}
                    className="h-7 w-7 text-[11px]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">
                      {a.name}
                    </span>
                    {a.email && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {a.email}
                      </span>
                    )}
                  </span>
                  {selected && (
                    <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  )}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Assignee *filter* control for the claims list. Same searchable, avatar'd modal
 * as AssigneePicker, but with "All assignees" / "Unassigned" buckets and its own
 * trigger button. `value` / onChange use "all" | "unassigned" | <name>.
 */
export function AssigneeFilterPicker({
  value,
  onChange,
  admins,
  loading,
}: {
  value: string;
  onChange: (value: string) => void;
  admins: WarrantyAdmin[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const isPerson = value !== "all" && value !== "unassigned";

  const list = useMemo<WarrantyAdmin[]>(() => {
    if (isPerson && !admins.some((a) => a.name === value)) {
      return [{ id: `legacy:${value}`, name: value, email: "" }, ...admins];
    }
    return admins;
  }, [admins, value, isPerson]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term),
    );
  }, [list, q]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQ("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-[150px] shrink-0 items-center gap-1.5 rounded-md border border-input bg-transparent px-2 text-[11px] transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {value === "all" ? (
          <>
            <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="truncate">All assignees</span>
          </>
        ) : value === "unassigned" ? (
          <span className="truncate text-muted-foreground italic">Unassigned</span>
        ) : (
          <>
            <AssigneeAvatar
              name={value}
              picture={adminPicture(admins, value)}
              className="h-4 w-4 text-[9px]"
            />
            <span className="truncate">{value}</span>
          </>
        )}
        <ChevronsUpDown
          className="ml-auto h-3 w-3 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQ("");
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border px-4 pt-4 pb-3">
            <DialogTitle className="text-[15px]">Filter by assignee</DialogTitle>
          </DialogHeader>

          <div className="border-b border-border px-4 py-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search people…"
                className="h-9 pl-8 text-[13px]"
              />
            </div>
          </div>

          <div className="max-h-[min(60vh,340px)] overflow-y-auto py-1.5">
            <button
              type="button"
              className={ROW_BASE}
              onClick={() => choose("all")}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
                <Users className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="flex-1 text-[13px]">All assignees</span>
              {value === "all" && (
                <Check className="h-4 w-4 text-primary" aria-hidden />
              )}
            </button>
            <button
              type="button"
              className={ROW_BASE}
              onClick={() => choose("unassigned")}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                <X className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="flex-1 text-[13px] text-muted-foreground italic">
                Unassigned
              </span>
              {value === "unassigned" && (
                <Check className="h-4 w-4 text-primary" aria-hidden />
              )}
            </button>

            {loading ? (
              <AssigneeListSkeleton />
            ) : filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                No people match “{q}”.
              </p>
            ) : (
              filtered.map((a) => {
                const selected = value === a.name;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={cn(ROW_BASE, selected && "bg-muted/40")}
                    onClick={() => choose(a.name)}
                  >
                    <AssigneeAvatar
                      name={a.name}
                      picture={a.picture}
                      className="h-7 w-7 text-[11px]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {a.name}
                      </span>
                      {a.email && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {a.email}
                        </span>
                      )}
                    </span>
                    {selected && (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
