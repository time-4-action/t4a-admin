"use client";
import { useEffect, useState } from "react";
import type { MkPartner } from "@/types/documents";

// Shared client state for the admin document pages: the selected customer,
// persisted to localStorage so it is reused across Invoices / Offers / Orders /
// Customer and on reload. Defaults to the customer matching the admin's own
// email (via /api/admin/documents/me).
const LS_KEY = "mk_customer_v1";

export function useSelectedCustomer() {
  const [customer, setCustomer] = useState<MkPartner | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as MkPartner;
        if (p && p.mkId) {
          setCustomer(p);
          setReady(true);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    fetch("/api/admin/documents/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (cancelled) return;
        if (b?.partner?.mkId) {
          setCustomer(b.partner);
          try {
            localStorage.setItem(LS_KEY, JSON.stringify(b.partner));
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSelect = (p: MkPartner) => {
    setCustomer(p);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  };

  return { customer, ready, onSelect };
}
