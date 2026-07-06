"use client";
import { Crown } from "lucide-react";
import { AccessManager } from "@/components/access-manager";

// Manages the built-in "admin" super-admin role. This page is strict
// super-admin only (routed to the admin-only "system" section in lib/access.ts),
// and "admin" is privileged, so the roles PATCH route also limits grants to
// super-admins. AccessManager bypasses its locked-admin badge when the managed
// role IS "admin", so admins stay toggleable here.
export default function SuperAdminsPage() {
  return (
    <AccessManager
      roleName="admin"
      title="Super Admins"
      icon={Crown}
      accent="rose"
      envVarName="admin"
      lead={
        <>
          Super admins hold the{" "}
          <strong className="text-foreground">admin</strong> role and have{" "}
          <strong className="text-foreground">full access to everything</strong>{" "}
          — every section, plus the ability to grant and revoke any role. Grant
          this only to people you fully trust.
        </>
      }
      grant={{
        heading: "Grant super-admin",
        roleSubtitle: "Admin · full access to everything",
        ack: "I understand this grants complete super-admin access to the entire portal.",
      }}
    />
  );
}
