"use client";
import { Wrench } from "lucide-react";
import { AccessManager } from "@/components/access-manager";
import { WARRANTY_ADMIN_ROLE_NAME } from "@/lib/warranty-role";

export default function WarrantyAccessPage() {
  return (
    <AccessManager
      roleName={WARRANTY_ADMIN_ROLE_NAME}
      title="Warranty Access"
      icon={Wrench}
      accent="amber"
      envVarName="NEXT_PUBLIC_WARRANTY_ADMIN_ROLE_NAME"
      lead={
        <>
          Members of the{" "}
          <strong className="text-foreground">{WARRANTY_ADMIN_ROLE_NAME}</strong>{" "}
          role can manage warranty claims and are offered as claim assignees.
          Only an admin can change this.
        </>
      }
      grant={{
        heading: "Grant warranty access",
        roleSubtitle: "Warranty admin · manages claims",
        ack: "I understand this grants access to manage warranty claims.",
      }}
    />
  );
}
