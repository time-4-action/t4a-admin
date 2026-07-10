// lib/auth0-cache.ts
//
// A tiny in-process TTL cache with single-flight, used to shield the Auth0 Management
// API from bursts. Every admin page that lists users/roles hits the same few Management
// endpoints; without this each page load re-fetches the full user list + one call per
// role, which quickly trips Auth0's global rate limit (429 too_many_requests).
//
// - Entries store the in-flight PROMISE, so concurrent callers share one request
//   (single-flight) instead of each firing their own.
// - Failures are not cached (the entry is dropped) so a transient 429 doesn't stick.
// - The store lives on `global` so it survives Next.js hot-reload / route re-entry.
//
// This is a single-instance cache (the admin runs as one container). If it is ever
// scaled horizontally, each instance keeps its own short-lived cache — still correct,
// just a lower hit rate.

type Entry = { value: Promise<unknown>; expires: number };

declare global {
  // eslint-disable-next-line no-var
  var _auth0Cache: Map<string, Entry> | undefined;
}

const store: Map<string, Entry> = (global._auth0Cache ??= new Map());

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;

  const value = fn().catch((err) => {
    // Don't cache failures — let the next caller retry.
    if (store.get(key)?.value === value) store.delete(key);
    throw err;
  });
  store.set(key, { value, expires: now + ttlMs });
  return value;
}

// Clear the whole cache. Call after any mutation that changes users/roles so the next
// read reflects it immediately instead of waiting for the TTL to lapse.
export function invalidateAuth0Cache(): void {
  store.clear();
}
