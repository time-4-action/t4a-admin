"use client";
import { ShoppingCart } from "lucide-react";
import { AccessManager } from "@/components/access-manager";
import { PREORDER_ADMIN_ROLE_NAME } from "@/lib/preorder-role";

export default function PreorderAccessPage() {
  return (
    <AccessManager
      roleName={PREORDER_ADMIN_ROLE_NAME}
      title="Preorder Access"
      icon={ShoppingCart}
      accent="lime"
      envVarName="NEXT_PUBLIC_PREORDER_ADMIN_ROLE_NAME"
      lead={
        <>
          Members of the{" "}
          <strong className="text-foreground">{PREORDER_ADMIN_ROLE_NAME}</strong>{" "}
          role can build preorder campaigns (order sheets) and review every
          partner&rsquo;s submitted preorder. Partners fill their own preorders in
          the B2B portal without any role. Only an admin can change this.
        </>
      }
      grant={{
        heading: "Grant preorder access",
        roleSubtitle: "Preorder admin · builds sheets and reviews all preorders",
        ack: "I understand this grants access to build and review every partner's preorders.",
      }}
    />
  );
}
