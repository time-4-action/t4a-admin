"use client";

// The sheet builder's image manager — one dialog for a row's image and for a group's
// images (the first one is the group's cover on the catalogue card).
//
// Uploads are made fast before they leave the browser: every picked file is decoded
// and re-encoded as WebP at most MAX_EDGE px on its longest side (a 10 MB phone photo
// becomes ~300 KB), then sent with XHR so the dialog can show real progress. Files the
// browser can't decode (and GIFs, which may be animated) go up as they are.
// POST /api/admin/preorder/products/image stores them in the asset bucket.

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ImagePlus, Loader2, RotateCcw, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MAX_EDGE = 2000;
const QUALITY = 0.85;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

type Job = {
  id: string;
  name: string;
  preview: string;
  file: File;
  stage: "optimising" | "uploading" | "done" | "error";
  progress: number; // 0..1 while uploading
  before: number;
  after: number | null;
  error?: string;
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Downscale + re-encode as WebP. Falls back to the original when the browser can't
// decode it, when it's a GIF, or when re-encoding would not make it smaller.
async function optimise(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", QUALITY));
  if (!blob || blob.type !== "image/webp") return file;
  return blob.size < file.size || scale < 1 ? blob : file;
}

function uploadWithProgress(blob: Blob, name: string, campaignId: string, onProgress: (p: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", blob, name);
    fd.append("campaignId", campaignId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/preorder/products/image");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const data = xhr.response as { url?: string; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && data?.url) resolve(data.url);
      else reject(new Error(data?.error ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Network error — check the connection and retry."));
    xhr.send(fd);
  });
}

export function ImageManagerDialog({
  open,
  onOpenChange,
  title,
  description,
  images,
  multiple,
  campaignId,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  images: string[];
  /** Group: several images, the first is the cover. Row: exactly one (upload replaces). */
  multiple: boolean;
  campaignId: string;
  onChange: (images: string[]) => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Uploads finish asynchronously: always apply them to the latest image list.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const patch = (id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const run = useCallback(
    async (job: Job) => {
      patch(job.id, { stage: "optimising", progress: 0, error: undefined });
      try {
        const blob = await optimise(job.file);
        const ext = blob.type === "image/webp" ? "webp" : job.file.name.split(".").pop() ?? "jpg";
        patch(job.id, { stage: "uploading", after: blob.size });
        const url = await uploadWithProgress(blob, `${job.name.replace(/\.[^.]+$/, "")}.${ext}`, campaignId, (p) =>
          patch(job.id, { progress: p }),
        );
        patch(job.id, { stage: "done", progress: 1 });
        const next = multiple ? [...imagesRef.current, url] : [url];
        imagesRef.current = next; // two uploads finishing in one tick must not drop one
        onChangeRef.current(next);
      } catch (e) {
        patch(job.id, { stage: "error", error: (e as Error).message });
      }
    },
    [campaignId, multiple],
  );

  function addFiles(list: FileList | File[]) {
    let files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (!multiple) files = files.slice(0, 1);
    const fresh: Job[] = files.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name,
      preview: URL.createObjectURL(f),
      file: f,
      stage: "optimising",
      progress: 0,
      before: f.size,
      after: null,
      ...(f.size > MAX_INPUT_BYTES ? { stage: "error" as const, error: `Too large (${fmtBytes(f.size)}, max 40 MB).` } : {}),
    }));
    if (fresh.length === 0) return;
    setJobs((js) => (multiple ? [...js, ...fresh] : fresh));
    for (const j of fresh) if (j.stage !== "error") void run(j);
  }

  // Paste an image straight from the clipboard while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, multiple, run]);

  // Fresh queue each time the dialog opens; free the previews.
  useEffect(() => {
    if (open) return;
    setJobs((js) => {
      js.forEach((j) => URL.revokeObjectURL(j.preview));
      return [];
    });
  }, [open]);

  const busy = jobs.some((j) => j.stage === "optimising" || j.stage === "uploading");
  const active = jobs.filter((j) => j.stage !== "done");

  function remove(url: string) {
    onChange(images.filter((u) => u !== url));
  }
  function makeCover(url: string) {
    onChange([url, ...images.filter((u) => u !== url)]);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!busy || o ? onOpenChange(o) : undefined)}>
      <DialogContent className="sm:max-w-2xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 text-left">
          <DialogTitle className="text-[15px]">{title}</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            {description ??
              (multiple
                ? "The first image is the cover customers see on the catalogue card."
                : "Shown next to the variant on the customer's order sheet.")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Current images */}
          {images.length > 0 && (
            <div className={cn("grid gap-3", multiple ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1")}>
              {images.map((url, i) => (
                <div
                  key={url}
                  className={cn(
                    "group/img relative rounded-xl border border-border bg-muted/30 overflow-hidden",
                    multiple ? "aspect-square" : "aspect-[4/3] max-h-72",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="absolute inset-0 w-full h-full object-contain" />
                  {multiple && i === 0 && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-lime-500 text-white px-1.5 h-5 text-[10px] font-semibold">
                      <Star className="size-3 fill-current" /> Cover
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover/img:opacity-100 focus-within:opacity-100 transition-opacity">
                    {multiple && i > 0 && (
                      <Button size="xs" variant="secondary" onClick={() => makeCover(url)} className="h-7 text-[11px]">
                        <Star className="size-3" /> Make cover
                      </Button>
                    )}
                    {!multiple && (
                      <Button size="xs" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy} className="h-7 text-[11px]">
                        <Upload className="size-3" /> Replace
                      </Button>
                    )}
                    <Button size="xs" variant="destructive" onClick={() => remove(url)} className="h-7 text-[11px]">
                      <Trash2 className="size-3" /> Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Drop zone */}
          {(multiple || images.length === 0) && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cn(
                "rounded-xl border-2 border-dashed px-5 py-8 text-center cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                dragging ? "border-lime-500 bg-lime-500/10" : "border-border bg-muted/20 hover:border-lime-500/60 hover:bg-lime-500/5",
              )}
            >
              <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-lime-500/10 text-lime-700 dark:text-lime-400">
                <ImagePlus className="size-5" />
              </span>
              <p className="mt-3 text-[13px] font-medium text-foreground">
                {dragging ? "Drop to upload" : multiple ? "Drop images here, or click to choose" : "Drop an image here, or click to choose"}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                JPG, PNG, WebP, GIF or AVIF · you can also paste · large photos are resized automatically
              </p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            multiple={multiple}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {/* Upload queue */}
          {active.length > 0 && (
            <ul className="rounded-xl border border-border divide-y divide-border/60">
              {active.map((j) => (
                <li key={j.id} className="flex items-center gap-3 px-3 py-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={j.preview} alt="" className="size-10 rounded-md object-cover ring-1 ring-border shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="truncate font-medium text-foreground">{j.name}</span>
                      <span className={cn("shrink-0 tabular-nums", j.stage === "error" ? "text-rose-600" : "text-muted-foreground")}>
                        {j.stage === "optimising" && "Optimising…"}
                        {j.stage === "uploading" && `${Math.round(j.progress * 100)}%`}
                        {j.stage === "error" && "Failed"}
                      </span>
                    </div>
                    {j.stage === "error" ? (
                      <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="size-3 shrink-0" /> {j.error}
                      </p>
                    ) : (
                      <>
                        <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full bg-lime-500 transition-[width] duration-200",
                              j.stage === "optimising" && "w-1/4 animate-pulse",
                            )}
                            style={j.stage === "uploading" ? { width: `${Math.max(4, j.progress * 100)}%` } : undefined}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                          {fmtBytes(j.before)}
                          {j.after != null && j.after < j.before && <> → {fmtBytes(j.after)}</>}
                        </p>
                      </>
                    )}
                  </div>
                  {j.stage === "error" && (
                    <Button size="xs" variant="outline" onClick={() => void run(j)} className="h-7 text-[11px] shrink-0">
                      <RotateCcw className="size-3" /> Retry
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 sm:justify-between sm:items-center">
          <p className="text-[11px] text-muted-foreground hidden sm:flex items-center gap-1.5">
            {busy ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Uploading — keep this open
              </>
            ) : jobs.some((j) => j.stage === "done") ? (
              <>
                <Check className="size-3 text-lime-600" /> Saved to the sheet
              </>
            ) : (
              "Changes save with the sheet."
            )}
          </p>
          <Button size="sm" onClick={() => onOpenChange(false)} disabled={busy} className="h-8 text-[12px]">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
