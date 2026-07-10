"use client";
import { FileText } from "lucide-react";
import { AccessManager } from "@/components/access-manager";
import { DOCUMENTS_ADMIN_ROLE_NAME } from "@/lib/documents-role";

export default function DocumentsAccessPage() {
  return (
    <AccessManager
      roleName={DOCUMENTS_ADMIN_ROLE_NAME}
      title="Documents Access"
      icon={FileText}
      accent="teal"
      envVarName="NEXT_PUBLIC_DOCUMENTS_ADMIN_ROLE_NAME"
      lead={
        <>
          Members of the{" "}
          <strong className="text-foreground">{DOCUMENTS_ADMIN_ROLE_NAME}</strong>{" "}
          role can browse <strong className="text-foreground">any</strong>{" "}
          customer&rsquo;s Metakocka offers, orders &amp; invoices in the
          Documents section. Customers still see only their own documents in the
          B2B portal without any role. Only an admin can change this.
        </>
      }
      grant={{
        heading: "Grant documents access",
        roleSubtitle: "Documents admin · browses every customer's documents",
        ack: "I understand this grants access to every customer's documents.",
      }}
    />
  );
}
