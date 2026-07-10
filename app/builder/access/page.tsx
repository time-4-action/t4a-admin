"use client";
import { Blocks } from "lucide-react";
import { AccessManager } from "@/components/access-manager";
import { BUILDER_ADMIN_ROLE_NAME } from "@/lib/builder-role";

export default function BuilderAccessPage() {
  return (
    <AccessManager
      roleName={BUILDER_ADMIN_ROLE_NAME}
      title="Builder Access"
      icon={Blocks}
      accent="blue"
      envVarName="NEXT_PUBLIC_BUILDER_ADMIN_ROLE_NAME"
      lead={
        <>
          Members of the{" "}
          <strong className="text-foreground">{BUILDER_ADMIN_ROLE_NAME}</strong>{" "}
          role can use the Section Builder to generate website components (radar
          charts, range bars). Only an admin can change this.
        </>
      }
      grant={{
        heading: "Grant builder access",
        roleSubtitle: "Builder admin · builds website sections",
        ack: "I understand this grants access to the Section Builder.",
      }}
    />
  );
}
