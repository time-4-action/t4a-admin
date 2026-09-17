"use client";
import { Users } from "lucide-react";
import { AccessManager } from "@/components/access-manager";
import { CUSTOMERS_ADMIN_ROLE_NAME } from "@/lib/customers-role";

export default function CustomersAccessPage() {
  return (
    <AccessManager
      roleName={CUSTOMERS_ADMIN_ROLE_NAME}
      title="Customers Access"
      icon={Users}
      accent="cyan"
      envVarName="NEXT_PUBLIC_CUSTOMERS_ADMIN_ROLE_NAME"
      lead={
        <>
          Members of the{" "}
          <strong className="text-foreground">{CUSTOMERS_ADMIN_ROLE_NAME}</strong>{" "}
          role can browse every Metakocka customer, see their preorders across
          campaigns and open the customer portal as them. Preorder admins have this
          already. Only an admin can change this.
        </>
      }
      grant={{
        heading: "Grant customers access",
        roleSubtitle: "Customers admin · directory + view the portal as any customer",
        ack: "I understand this grants access to every customer's data and their portal view.",
      }}
    />
  );
}
