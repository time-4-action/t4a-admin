"use client";
import { Warehouse } from "lucide-react";
import { AccessManager } from "@/components/access-manager";
import { AUTOMATION_ADMIN_ROLE_NAME } from "@/lib/automation-role";

export default function AutomationAccessPage() {
  return (
    <AccessManager
      roleName={AUTOMATION_ADMIN_ROLE_NAME}
      title="Automation Access"
      icon={Warehouse}
      accent="amber"
      envVarName="NEXT_PUBLIC_AUTOMATION_ADMIN_ROLE_NAME"
      lead={
        <>
          Members of the{" "}
          <strong className="text-foreground">{AUTOMATION_ADMIN_ROLE_NAME}</strong>{" "}
          role can access the Automation tools (warehouse &amp; products,
          catalogue sync). Only an admin can change this.
        </>
      }
      grant={{
        heading: "Grant automation access",
        roleSubtitle: "Automation admin · manages automation",
        ack: "I understand this grants access to the automation tools.",
      }}
    />
  );
}
