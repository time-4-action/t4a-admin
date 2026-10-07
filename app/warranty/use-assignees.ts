"use client";
import { useEffect, useState } from "react";
import type { WarrantyAdmin } from "@/types/warranty";

type State = {
  admins: WarrantyAdmin[];
  names: string[];
  loading: boolean;
  error: boolean;
};

/**
 * Loads the warranty-admin users offered as assignees from
 * GET /api/warranty/assignees. Used by the list page and the claim detail view.
 */
export function useWarrantyAssignees(): State {
  const [admins, setAdmins] = useState<WarrantyAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/warranty/assignees")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: WarrantyAdmin[]) => {
        if (!cancelled) setAdmins(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { admins, names: admins.map((a) => a.name), loading, error };
}
