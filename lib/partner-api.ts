import "server-only";

// Server-side proxy to the partner-portal API's internal admin surface
// (/api/admin/partners/*). Adds the shared bearer token and lifts the body /
// status code back. Mirrors lib/warranty-api.ts — the token never reaches the
// browser. The partner portal owns the data; this admin is a thin reader/writer.

const TIMEOUT_MS = 15_000;

function getBase(): string {
  const base = process.env.PARTNER_API_BASE;
  if (!base) {
    throw new Error("PARTNER_API_BASE not configured");
  }
  return base.replace(/\/$/, "");
}

function getToken(): string {
  const token = process.env.PARTNER_API_TOKEN;
  if (!token) {
    throw new Error("PARTNER_API_TOKEN not configured");
  }
  return token;
}

export type PartnerApiResponse =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string; data?: unknown };

export async function callPartnerPortal(
  path: string,
  init: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<PartnerApiResponse> {
  const url = `${getBase()}${path.startsWith("/") ? "" : "/"}${path}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const err =
        data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : `partner api ${res.status}`;
      return { ok: false, status: res.status, error: err, data };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: `partner api unreachable: ${msg}` };
  } finally {
    clearTimeout(t);
  }
}
