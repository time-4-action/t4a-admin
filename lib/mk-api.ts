import "server-only";

// Server-side proxy to the t4a-mk-automation service (the Metakocka warehouse/products
// sync engine). It authenticates with the service's `x-api-key` header; the key never
// reaches the browser. Mirrors lib/partner-api.ts / lib/warranty-api.ts. The automation
// service owns its data (cron schedules, run history); this admin is a thin reader/writer.

const TIMEOUT_MS = 20_000;

function getBase(): string {
  const base = process.env.MK_API_BASE;
  if (!base) {
    throw new Error("MK_API_BASE not configured");
  }
  return base.replace(/\/$/, "");
}

function getToken(): string {
  const token = process.env.MK_API_TOKEN;
  if (!token) {
    throw new Error("MK_API_TOKEN not configured");
  }
  return token;
}

export type MkApiResponse =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string; data?: unknown };

export async function callMkAutomation(
  path: string,
  init: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<MkApiResponse> {
  const url = `${getBase()}${path.startsWith("/") ? "" : "/"}${path}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        "x-api-key": getToken(),
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
          : `mk-automation api ${res.status}`;
      return { ok: false, status: res.status, error: err, data };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: `mk-automation api unreachable: ${msg}` };
  } finally {
    clearTimeout(t);
  }
}
