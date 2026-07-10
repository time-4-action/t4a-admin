"use client";
import { Handshake } from "lucide-react";
import { AccessManager } from "@/components/access-manager";
import { PARTNER_ROLE_NAME } from "@/lib/partner-role";

export default function PartnersAccessPage() {
  return (
    <AccessManager
      roleName={PARTNER_ROLE_NAME}
      title="Partners Access"
      icon={Handshake}
      accent="indigo"
      envVarName="NEXT_PUBLIC_PARTNER_ROLE_NAME"
      lead={
        <>
          Members of the{" "}
          <strong className="text-foreground">{PARTNER_ROLE_NAME}</strong> role
          are partners — they appear in the Partners list and can use the partner
          portal (connect Shopify, build exports, and run feeds). Grant it to give
          a user partner access; revoke it to remove them.
        </>
      }
      grant={{
        heading: "Grant partner access",
        roleSubtitle: "Partner · uses the partner portal",
        ack: "I understand this grants partner (export) access to the portal.",
      }}
    />
  );
}
